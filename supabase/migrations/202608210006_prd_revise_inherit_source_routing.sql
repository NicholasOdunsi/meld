-- A PRD revision accepted from a Product Agent proposal is a continuation of
-- that reply. Keep it on the provider and model that produced the proposal
-- unless a caller explicitly overrides the provider.
create or replace function public.create_prd_revise_task(
  target_room_id uuid,
  source_task_id uuid,
  target_provider public.ai_provider default null
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
  resolved_model text;
  source_provider public.ai_provider;
  source_model text;
  change_request text;
  frozen_manifest jsonb;
  result_task public.ai_tasks%rowtype;
begin
  if caller_id is null then
    raise exception 'invalid_prd_revise_request' using errcode = 'P0001';
  end if;

  select room.workspace_id into target_workspace_id
  from public.rooms as room
  where room.id = target_room_id;

  if target_workspace_id is null
    or not public.is_room_participant(target_room_id)
  then
    raise exception 'invalid_prd_revise_request' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.prds as prd where prd.room_id = target_room_id
  ) then
    raise exception 'invalid_prd_revise_request' using errcode = 'P0001';
  end if;

  select message.body, source_task.provider, source_task.model
  into change_request, source_provider, source_model
  from public.ai_tasks as source_task
  join public.messages as message
    on message.id = source_task.source_message_id
    and message.room_id = target_room_id
  where source_task.id = source_task_id
    and source_task.room_id = target_room_id;

  if change_request is null then
    raise exception 'invalid_prd_revise_request' using errcode = 'P0001';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_room_id::text, 1)
  );

  select task.* into result_task
  from public.ai_tasks as task
  where task.room_id = target_room_id
    and task.kind = 'prd_revise'
    and task.status in (
      'queued', 'waiting_for_device', 'ready_to_run', 'running'
    )
  order by task.created_at, task.id
  limit 1;

  if result_task.id is not null then
    return jsonb_build_object(
      'id', result_task.id,
      'roomId', result_task.room_id,
      'provider', result_task.provider,
      'model', result_task.model,
      'kind', result_task.kind,
      'status', result_task.status,
      'createdAt', result_task.created_at,
      'updatedAt', result_task.updated_at
    );
  end if;

  select preference.default_device_id,
         coalesce(target_provider, source_provider, preference.default_provider)
  into resolved_device_id, resolved_provider
  from public.ai_user_preferences as preference
  where preference.user_id = caller_id;

  if target_provider is null or target_provider = source_provider then
    resolved_model := source_model;
  end if;

  if resolved_device_id is null or resolved_provider is null then
    raise exception 'invalid_prd_revise_request' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.execution_devices as device
    where device.id = resolved_device_id and device.user_id = caller_id
      and device.status = 'active' and device.revoked_at is null
  ) then
    raise exception 'invalid_prd_revise_request' using errcode = 'P0001';
  end if;

  if not exists (
    select 1 from public.provider_connections as connection
    where connection.device_id = resolved_device_id
      and connection.user_id = caller_id
      and connection.provider = resolved_provider
      and connection.installation = 'installed'
      and connection.authentication = 'authenticated'
      and connection.compatibility = 'supported'
  ) then
    raise exception 'invalid_prd_revise_request' using errcode = 'P0001';
  end if;

  frozen_manifest := jsonb_build_object(
    'messageIds', (select coalesce(jsonb_agg(m.id order by m.created_at, m.id),'[]'::jsonb)
      from public.messages as m where m.room_id = target_room_id),
    'attachmentIds', (select coalesce(jsonb_agg(a.id order by a.created_at, a.id),'[]'::jsonb)
      from public.attachments as a where a.room_id = target_room_id
        and a.message_id is not null and a.discard_pending = false),
    'evidenceIds', (select coalesce(jsonb_agg(e.id order by e.created_at, e.id),'[]'::jsonb)
      from public.evidence as e where e.room_id = target_room_id),
    'decisionIds', (select coalesce(jsonb_agg(d.id order by d.created_at, d.id),'[]'::jsonb)
      from public.decisions as d where d.room_id = target_room_id)
  );

  insert into public.ai_tasks (
    initiating_user_id, workspace_id, room_id, device_id, provider, model, kind,
    status, instruction, context_manifest_json, context_revision
  )
  values (
    caller_id, target_workspace_id, target_room_id, resolved_device_id,
    resolved_provider, resolved_model, 'prd_revise', 'queued',
    change_request, frozen_manifest, 0
  )
  returning * into result_task;

  return jsonb_build_object(
    'id', result_task.id,
    'roomId', result_task.room_id,
    'provider', result_task.provider,
    'model', result_task.model,
    'kind', result_task.kind,
    'status', result_task.status,
    'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_prd_revise_task(
  uuid, uuid, public.ai_provider
) from public, anon, authenticated, service_role;
grant execute on function public.create_prd_revise_task(
  uuid, uuid, public.ai_provider
) to authenticated;
