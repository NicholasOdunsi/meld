-- Chat-to-screen slice 2c: carry the user's typed instruction into screen
-- generation, and add a restore RPC that reinstates a prior version as a
-- new, promoted, append-only version.

-- Three-argument overload of create_design_screen_generate_task. Identical
-- to the two-argument version in 202608130010_design_task_rpcs.sql -- same
-- advisory lock, same idempotent reuse of an in-flight task, same
-- design_screen_generations insert pinning base_version_id/profile_version_id,
-- same design_screens.updating flip, same generation_started event -- except
-- it writes the caller's trimmed instruction (capped at 4000 characters) into
-- ai_tasks.instruction, falling back to the same default instruction text
-- the two-argument version uses when the input is empty.
-- No defaults on target_provider/target_instruction here: giving them
-- defaults would let a 1- or 2-argument call resolve ambiguously against
-- the two-argument overload above once both sets of defaults are applied.
-- Requiring all three arguments keeps overload resolution unambiguous.
create function public.create_design_screen_generate_task(
  target_screen_id uuid,
  target_provider public.ai_provider,
  target_instruction text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_screen public.design_screens;
  resolved_device_id uuid;
  resolved_provider public.ai_provider;
  resolved_instruction text;
  frozen_manifest jsonb;
  active_profile_version uuid;
  result_task public.ai_tasks%rowtype;
begin
  if caller_id is null then
    raise exception 'invalid_design_screen_generate_request' using errcode = 'P0001';
  end if;

  select screen.* into target_screen
  from public.design_screens as screen
  where screen.id = target_screen_id
    and screen.deleted_at is null
  for update;

  if target_screen.id is null
    or not public.can_edit_room(target_screen.room_id)
  then
    raise exception 'invalid_design_screen_generate_request' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'design_screen_generate:' || target_screen_id::text,
      0
    )
  );

  select task.* into result_task
  from public.ai_tasks as task
  join public.design_screen_generations as generation
    on generation.task_id = task.id
  where generation.screen_id = target_screen_id
    and task.kind = 'design_screen_generate'
    and task.status in (
      'queued',
      'waiting_for_device',
      'ready_to_run',
      'running'
    )
  order by task.created_at, task.id
  limit 1;

  if result_task.id is not null then
    return jsonb_build_object(
      'id', result_task.id,
      'roomId', result_task.room_id,
      'provider', result_task.provider,
      'kind', result_task.kind,
      'status', result_task.status,
      'createdAt', result_task.created_at,
      'updatedAt', result_task.updated_at
    );
  end if;

  select preference.default_device_id,
    coalesce(target_provider, preference.default_provider)
  into resolved_device_id, resolved_provider
  from public.ai_user_preferences as preference
  where preference.user_id = caller_id;

  if resolved_device_id is null
    or resolved_provider is null
    or not exists (
      select 1
      from public.execution_devices as device
      where device.id = resolved_device_id
        and device.user_id = caller_id
        and device.status = 'active'
        and device.revoked_at is null
    )
    or not exists (
      select 1
      from public.provider_connections as connection
      where connection.device_id = resolved_device_id
        and connection.user_id = caller_id
        and connection.provider = resolved_provider
        and connection.installation = 'installed'
        and connection.authentication = 'authenticated'
        and connection.compatibility = 'supported'
    )
  then
    raise exception 'invalid_design_screen_generate_request' using errcode = 'P0001';
  end if;

  resolved_instruction := nullif(btrim(target_instruction), '');
  if resolved_instruction is null then
    resolved_instruction := 'Generate the target design screen from its authorized room context.';
  else
    resolved_instruction := left(resolved_instruction, 4000);
  end if;

  frozen_manifest := jsonb_build_object(
    'messageIds', (
      select coalesce(
        jsonb_agg(message.id order by message.created_at, message.id),
        '[]'::jsonb
      )
      from public.messages as message
      where message.room_id = target_screen.room_id
    ),
    'attachmentIds', (
      select coalesce(
        jsonb_agg(attachment.id order by attachment.created_at, attachment.id),
        '[]'::jsonb
      )
      from public.attachments as attachment
      where attachment.room_id = target_screen.room_id
        and attachment.message_id is not null
        and attachment.discard_pending = false
    ),
    'evidenceIds', (
      select coalesce(
        jsonb_agg(evidence.id order by evidence.created_at, evidence.id),
        '[]'::jsonb
      )
      from public.evidence as evidence
      where evidence.room_id = target_screen.room_id
    ),
    'decisionIds', (
      select coalesce(
        jsonb_agg(decision.id order by decision.created_at, decision.id),
        '[]'::jsonb
      )
      from public.decisions as decision
      where decision.room_id = target_screen.room_id
    )
  );

  select profile.active_version_id into active_profile_version
  from public.design_system_profiles as profile
  where profile.workspace_id = target_screen.workspace_id;

  insert into public.ai_tasks (
    initiating_user_id,
    workspace_id,
    room_id,
    device_id,
    provider,
    kind,
    status,
    instruction,
    context_manifest_json,
    context_revision
  ) values (
    caller_id,
    target_screen.workspace_id,
    target_screen.room_id,
    resolved_device_id,
    resolved_provider,
    'design_screen_generate',
    'queued',
    resolved_instruction,
    frozen_manifest,
    0
  )
  returning * into result_task;

  insert into public.design_screen_generations (
    task_id,
    screen_id,
    room_id,
    base_version_id,
    profile_version_id
  ) values (
    result_task.id,
    target_screen.id,
    target_screen.room_id,
    target_screen.current_version_id,
    active_profile_version
  );

  update public.design_screens
  set updating = true,
      updated_at = now()
  where id = target_screen_id;

  perform public.append_design_screen_event(
    target_screen.room_id,
    target_screen_id,
    'generation_started',
    null,
    result_task.id,
    null,
    caller_id
  );

  return jsonb_build_object(
    'id', result_task.id,
    'roomId', result_task.room_id,
    'provider', result_task.provider,
    'kind', result_task.kind,
    'status', result_task.status,
    'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
exception when unique_violation then
  select task.* into result_task
  from public.ai_tasks as task
  join public.design_screen_generations as generation
    on generation.task_id = task.id
  where generation.screen_id = target_screen_id
    and task.kind = 'design_screen_generate'
    and task.status in (
      'queued',
      'waiting_for_device',
      'ready_to_run',
      'running'
    )
  order by task.created_at, task.id
  limit 1;

  if result_task.id is null then
    raise exception 'invalid_design_screen_generate_request' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'id', result_task.id,
    'roomId', result_task.room_id,
    'provider', result_task.provider,
    'kind', result_task.kind,
    'status', result_task.status,
    'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_design_screen_generate_task(
  uuid,
  public.ai_provider,
  text
) from public, anon, authenticated, service_role;
grant execute on function public.create_design_screen_generate_task(
  uuid,
  public.ai_provider,
  text
) to authenticated;

-- Restore = append a NEW version copied from the source, based on the
-- current version, promote it, and append a 'restored' event. History
-- stays append-only: an existing design_screen_versions row is never
-- mutated or deleted (see the before-update-or-delete immutability trigger
-- in 202608130006_design_screens.sql), and the pointer never rewinds.
create function public.restore_design_screen_version(
  target_screen_id uuid, target_version_id uuid)
returns public.design_screen_versions
language plpgsql security definer set search_path = '' as $$
declare
  screen public.design_screens;
  source public.design_screen_versions;
  restored public.design_screen_versions;
begin
  select * into screen from public.design_screens where id = target_screen_id for update;
  if screen.id is null or not public.can_edit_room(screen.room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into source from public.design_screen_versions
    where id = target_version_id and screen_id = target_screen_id;
  if source.id is null then
    raise exception 'design_screen_version_not_found' using errcode = 'P0001';
  end if;

  -- Restore = append a NEW version copied from the source, based on current,
  -- and promote it. History stays append-only; the pointer never rewinds.
  insert into public.design_screen_versions (
    screen_id, room_id, markup, styles, script, actions_json,
    base_version_id, profile_version_id, created_by, promoted)
  values (
    target_screen_id, screen.room_id, source.markup, source.styles, source.script, source.actions_json,
    screen.current_version_id, source.profile_version_id, auth.uid(), true)
  returning * into restored;

  update public.design_screens
     set current_version_id = restored.id, state = 'built', updated_at = now()
   where id = target_screen_id;

  perform public.append_design_screen_event(
    screen.room_id, target_screen_id, 'restored', null, null, restored.id, auth.uid());
  return restored;
end; $$;

revoke all on function public.restore_design_screen_version(uuid, uuid) from public;
grant execute on function public.restore_design_screen_version(uuid, uuid) to authenticated;
