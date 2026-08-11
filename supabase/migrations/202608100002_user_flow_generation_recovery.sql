-- Forward-only recovery and hydration support for generated user flows.
alter table public.user_flow_generations
  add column applied_at timestamptz;

create index user_flow_generations_unapplied_initiator_idx
  on public.user_flow_generations(initiating_user_id, room_id, created_at, task_id)
  where applied_at is null;

create function public.list_unapplied_user_flow_generations(target_room_id uuid)
returns table(task_id uuid, room_id uuid, document jsonb, created_at timestamptz)
language sql
security definer
set search_path = ''
as $$
  select generation.task_id, generation.room_id,
    generation.document, generation.created_at
  from public.user_flow_generations as generation
  where generation.room_id = target_room_id
    and generation.initiating_user_id = auth.uid()
    and generation.applied_at is null
    and public.is_room_participant(generation.room_id)
  order by generation.created_at, generation.task_id;
$$;

revoke all on function public.list_unapplied_user_flow_generations(uuid)
  from public, anon, service_role;
grant execute on function public.list_unapplied_user_flow_generations(uuid)
  to authenticated;

create function public.mark_user_flow_generation_applied(target_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_flow_generations as generation
  set applied_at = coalesce(generation.applied_at, now())
  where generation.task_id = target_task_id
    and generation.initiating_user_id = auth.uid()
    and public.can_edit_room(generation.room_id);
  return found;
end;
$$;

revoke all on function public.mark_user_flow_generation_applied(uuid)
  from public, anon, service_role;
grant execute on function public.mark_user_flow_generation_applied(uuid)
  to authenticated;

-- Preserve the shipped hydration implementation as the authorization and
-- manifest reader, then enrich only user-flow tasks with the current PRD.
alter function public.hydrate_authorized_room_context(uuid, uuid)
  rename to hydrate_authorized_room_context_pre_user_flow;

revoke all on function public.hydrate_authorized_room_context_pre_user_flow(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context_pre_user_flow(uuid, uuid)
  to service_role;

create function public.hydrate_authorized_room_context(
  target_task_id uuid,
  target_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hydrated_result jsonb;
  hydrated_context jsonb;
  existing_prd jsonb;
  target_device_id uuid;
begin
  hydrated_result := public.hydrate_authorized_room_context_pre_user_flow(
    target_task_id,
    target_attempt_id
  );

  if hydrated_result ->> 'status' <> 'ready'
    or hydrated_result #>> '{context,kind}' <> 'user_flow_generate'
  then
    return hydrated_result;
  end if;

  select jsonb_build_object('version', prd.version, 'document', prd.document)
  into existing_prd
  from public.prds as prd
  where prd.room_id = (hydrated_result #>> '{context,roomId}')::uuid
  order by prd.version desc, prd.id desc
  limit 1;

  if existing_prd is null then
    return hydrated_result;
  end if;

  hydrated_context := (hydrated_result -> 'context')
    || jsonb_build_object('existingPrd', existing_prd);

  if octet_length(hydrated_context::text) > 524288 then
    select task.device_id into target_device_id
    from public.ai_tasks as task
    where task.id = target_task_id;

    perform public.settle_ai_task(
      target_task_id,
      target_device_id,
      target_attempt_id,
      'fail',
      'unknown',
      'Hydrated AI task context exceeds 512 KiB.',
      null,
      false
    );
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'context_too_large'
    );
  end if;

  return jsonb_set(hydrated_result, '{context}', hydrated_context);
end;
$$;

revoke all on function public.hydrate_authorized_room_context(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context(uuid, uuid)
  to service_role;
