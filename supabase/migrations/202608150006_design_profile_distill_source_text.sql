-- The document's extracted text needs to survive from upload to task
-- execution so hydrate_authorized_room_context (next migration) can hand it
-- to the connector. Mirrors attachments.extracted_text: same 100,000-
-- character bound, populated once at write time, never re-derived.
alter table public.design_profile_distills
  add column source_extracted_text text,
  add column source_file_name text,
  add constraint design_profile_distill_source_text_size
    check (
      source_extracted_text is null
      or char_length(source_extracted_text) <= 100000
    );

drop function public.create_design_profile_distill_task(
  uuid,
  public.ai_provider,
  text
);

create function public.create_design_profile_distill_task(
  target_room_id uuid,
  target_provider public.ai_provider default null,
  source_object_path text default null,
  source_extracted_text text default null,
  source_file_name text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_workspace_id uuid;
  resolved_device_id uuid;
  resolved_provider public.ai_provider;
  frozen_manifest jsonb;
  result_task public.ai_tasks%rowtype;
begin
  if caller_id is null or not public.can_edit_room(target_room_id) then
    raise exception 'invalid_design_profile_distill_request' using errcode = 'P0001';
  end if;

  select room.workspace_id into target_workspace_id
  from public.rooms as room
  where room.id = target_room_id;

  if target_workspace_id is null then
    raise exception 'invalid_design_profile_distill_request' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      'design_profile_distill:' || target_room_id::text,
      0
    )
  );

  select task.* into result_task
  from public.ai_tasks as task
  where task.room_id = target_room_id
    and task.initiating_user_id = caller_id
    and task.kind = 'design_profile_distill'
    and task.status in (
      'queued', 'waiting_for_device', 'ready_to_run', 'running'
    )
  order by task.created_at, task.id
  limit 1;

  if result_task.id is not null then
    return jsonb_build_object(
      'id', result_task.id, 'roomId', result_task.room_id,
      'provider', result_task.provider, 'kind', result_task.kind,
      'status', result_task.status, 'createdAt', result_task.created_at,
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
      select 1 from public.execution_devices as device
      where device.id = resolved_device_id
        and device.user_id = caller_id
        and device.status = 'active'
        and device.revoked_at is null
    )
    or not exists (
      select 1 from public.provider_connections as connection
      where connection.device_id = resolved_device_id
        and connection.user_id = caller_id
        and connection.provider = resolved_provider
        and connection.installation = 'installed'
        and connection.authentication = 'authenticated'
        and connection.compatibility = 'supported'
    )
  then
    raise exception 'invalid_design_profile_distill_request' using errcode = 'P0001';
  end if;

  frozen_manifest := jsonb_build_object(
    'messageIds', (
      select coalesce(jsonb_agg(message.id order by message.created_at, message.id), '[]'::jsonb)
      from public.messages as message where message.room_id = target_room_id
    ),
    'attachmentIds', (
      select coalesce(jsonb_agg(attachment.id order by attachment.created_at, attachment.id), '[]'::jsonb)
      from public.attachments as attachment
      where attachment.room_id = target_room_id
        and attachment.message_id is not null
        and attachment.discard_pending = false
    ),
    'evidenceIds', (
      select coalesce(jsonb_agg(evidence.id order by evidence.created_at, evidence.id), '[]'::jsonb)
      from public.evidence as evidence where evidence.room_id = target_room_id
    ),
    'decisionIds', (
      select coalesce(jsonb_agg(decision.id order by decision.created_at, decision.id), '[]'::jsonb)
      from public.decisions as decision where decision.room_id = target_room_id
    )
  );

  insert into public.ai_tasks (
    initiating_user_id, workspace_id, room_id, device_id, provider, kind,
    status, instruction, context_manifest_json, context_revision
  ) values (
    caller_id, target_workspace_id, target_room_id, resolved_device_id,
    resolved_provider, 'design_profile_distill', 'queued',
    'Distill the authorized design-system source into a validated profile.',
    frozen_manifest, 0
  )
  returning * into result_task;

  insert into public.design_profile_distills (
    task_id, workspace_id, room_id, source_object_path,
    source_extracted_text, source_file_name
  ) values (
    result_task.id, target_workspace_id, target_room_id, source_object_path,
    source_extracted_text, source_file_name
  );

  return jsonb_build_object(
    'id', result_task.id, 'roomId', result_task.room_id,
    'provider', result_task.provider, 'kind', result_task.kind,
    'status', result_task.status, 'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
exception when unique_violation then
  select task.* into result_task
  from public.ai_tasks as task
  where task.room_id = target_room_id
    and task.initiating_user_id = caller_id
    and task.kind = 'design_profile_distill'
    and task.status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
  order by task.created_at, task.id
  limit 1;

  if result_task.id is null then
    raise exception 'invalid_design_profile_distill_request' using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'id', result_task.id, 'roomId', result_task.room_id,
    'provider', result_task.provider, 'kind', result_task.kind,
    'status', result_task.status, 'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_design_profile_distill_task(
  uuid, public.ai_provider, text, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_design_profile_distill_task(
  uuid, public.ai_provider, text, text, text
) to authenticated;
