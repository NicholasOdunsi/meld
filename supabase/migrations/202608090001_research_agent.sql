create type public.ai_agent_kind as enum ('product', 'research');
create type public.ai_research_scope as enum ('room', 'web');

alter table public.ai_tasks
  add column agent_kind public.ai_agent_kind not null default 'product',
  add column research_scope public.ai_research_scope not null default 'room',
  add constraint ai_tasks_web_scope_requires_research check (
    agent_kind = 'research' or research_scope = 'room'
  );

-- Preserve the existing two-argument RPC for old clients. New clients use this
-- overload, which delegates all authorization and idempotency to the canonical
-- function and attaches the role metadata before the transaction is visible.
create function public.create_room_reply_task(
  target_source_message_id uuid,
  target_provider public.ai_provider,
  target_agent_kind public.ai_agent_kind,
  target_research_scope public.ai_research_scope
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  task public.ai_tasks%rowtype;
begin
  if target_agent_kind is null
    or target_research_scope is null
    or (
      target_agent_kind <> 'research'
      and target_research_scope <> 'room'
    )
  then
    raise exception 'invalid_room_reply_request' using errcode = 'P0001';
  end if;

  result := public.create_room_reply_task(
    target_source_message_id,
    target_provider
  );

  select candidate.*
  into task
  from public.ai_tasks as candidate
  where candidate.id = (result ->> 'id')::uuid
  for update;

  if task.id is null then
    raise exception 'invalid_room_reply_request' using errcode = 'P0001';
  end if;

  if task.agent_kind <> target_agent_kind
    or task.research_scope <> target_research_scope
  then
    if task.status = 'queued'
      and task.agent_kind = 'product'
      and task.research_scope = 'room'
    then
      update public.ai_tasks
      set agent_kind = target_agent_kind,
          research_scope = target_research_scope,
          updated_at = now()
      where id = task.id
      returning * into task;
    else
      raise exception 'room_reply_agent_mismatch' using errcode = 'P0001';
    end if;
  end if;

  return result || jsonb_build_object(
    'agentKind', task.agent_kind,
    'researchScope', task.research_scope,
    'updatedAt', task.updated_at
  );
end;
$$;

revoke all on function public.create_room_reply_task(
  uuid, public.ai_provider, public.ai_agent_kind, public.ai_research_scope
) from public;
revoke all on function public.create_room_reply_task(
  uuid, public.ai_provider, public.ai_agent_kind, public.ai_research_scope
) from anon, authenticated, service_role;
grant execute on function public.create_room_reply_task(
  uuid, public.ai_provider, public.ai_agent_kind, public.ai_research_scope
) to authenticated;

-- Include role metadata in the claim. The gateway merges these trusted task
-- fields into the separately hydrated room context before dispatching it.
create or replace function public.claim_ai_task(
  target_task_id uuid,
  target_device_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed_task public.ai_tasks%rowtype;
  inserted_attempt public.ai_task_attempts%rowtype;
  next_attempt_no integer;
begin
  perform device.id
  from public.execution_devices as device
  where device.id = target_device_id
    and device.status = 'active'
    and device.revoked_at is null
  for update;

  if not found then
    raise exception 'inactive_execution_device' using errcode = 'P0001';
  end if;

  select task.*
  into claimed_task
  from public.ai_tasks as task
  where task.id = target_task_id
    and task.device_id = target_device_id
    and task.status = 'ready_to_run'
  for update skip locked;

  if claimed_task.id is null then
    raise exception 'ai_task_claim_rejected' using errcode = 'P0001';
  end if;

  select coalesce(
    (
      select attempt.attempt_no
      from public.ai_task_attempts as attempt
      where attempt.task_id = target_task_id
      order by attempt.attempt_no desc
      limit 1
    ),
    0
  ) + 1
  into next_attempt_no;

  perform public.transition_ai_task(
    target_task_id,
    'running',
    'ready_to_run'
  );

  insert into public.ai_task_attempts (
    id,
    task_id,
    device_id,
    attempt_no,
    lease_expires_at
  )
  values (
    gen_random_uuid(),
    target_task_id,
    target_device_id,
    next_attempt_no,
    now() + public.ai_task_lease_duration()
  )
  returning * into inserted_attempt;

  return jsonb_build_object(
    'taskId', claimed_task.id,
    'attemptId', inserted_attempt.id,
    'provider', claimed_task.provider,
    'kind', claimed_task.kind,
    'instruction', claimed_task.instruction,
    'agentKind', claimed_task.agent_kind,
    'researchScope', claimed_task.research_scope
  );
end;
$$;

alter type public.message_author_type add value 'research_agent';
