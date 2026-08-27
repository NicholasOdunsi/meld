-- The prototype's buttons stopped connecting: a regenerated screen took the key
-- "schedule_test" while every button on the screen before it pointed at
-- "prospect_schedule_test".
--
-- The model was never told that key was waiting. This function truncated the
-- instruction to 4,000 characters -- inside the database, after the app had
-- already fitted its blocks to a budget -- and the list of keys that existing
-- buttons point at lives at the end of the instruction, so it was cut first.
-- The generated screen's own markup arrived intact, which is why the failure
-- looked like a linking bug rather than a truncated prompt.
--
-- Both the ai_tasks CHECK constraint and MAX_INSTRUCTION_CHARS have always
-- allowed 20,000. This aligns the three, so the app's own budget is the only
-- limit that decides anything.

CREATE OR REPLACE FUNCTION public.create_design_screen_generate_task(target_screen_id uuid, target_provider ai_provider, target_instruction text)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO ''
AS $function$
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
    -- 20,000, matching this table's own instruction CHECK constraint and
    -- MAX_INSTRUCTION_CHARS in the contracts package. It was 4,000, which
    -- silently truncated the prompt inside the database -- after the app had
    -- already budgeted it. The block that says which screen keys existing
    -- buttons point at sits at the end of the instruction, so it was the
    -- first thing cut: the model never saw that "prospect_schedule_test" was
    -- waiting to be built, invented "schedule_test" instead, and every button
    -- on the previous screen led nowhere.
    --
    -- Truncating here can only ever be silent, because the caller has no way
    -- to learn it happened. The app caps itself below this, so reaching this
    -- line at all now means something upstream is wrong.
    resolved_instruction := left(resolved_instruction, 20000);
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
$function$


