-- User-flow assist mirrors user-flow generation, but it edits the CURRENT
-- canvas flow rather than generating from room context, so the base flow is
-- captured client-side and frozen on the request row. The completed outcome --
-- a whole updated flow OR one clarifying question -- is materialized into this
-- narrow, participant-readable table so browsers never read ai_tasks.result_json.

create type public.user_flow_assist_status as enum (
  'pending', 'ready', 'failed', 'dismissed'
);

create table public.user_flow_assist_proposals (
  task_id uuid primary key references public.ai_tasks(id) on delete cascade,
  room_id uuid not null,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  initiating_user_id uuid not null references auth.users(id),
  client_request_id uuid not null,
  base_flow jsonb not null,
  instruction text not null
    check (char_length(btrim(instruction)) between 1 and 20000),
  status public.user_flow_assist_status not null default 'pending',
  proposed_flow jsonb,
  clarifying_question text check (
    clarifying_question is null
    or char_length(btrim(clarifying_question)) between 1 and 2000
  ),
  error_code public.task_error_code,
  applied_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  constraint user_flow_assist_base_flow_size
    check (pg_column_size(base_flow) <= 262144),
  constraint user_flow_assist_proposed_flow_size
    check (proposed_flow is null or pg_column_size(proposed_flow) <= 262144),
  -- Exactly one outcome once ready; also enforced in the materialization trigger.
  constraint user_flow_assist_ready_outcome check (
    status <> 'ready'
    or ((proposed_flow is null) <> (clarifying_question is null))
  ),
  unique (room_id, client_request_id),
  foreign key (room_id, workspace_id)
    references public.rooms(id, workspace_id) on delete cascade
);

create index user_flow_assist_room_created_at_idx
  on public.user_flow_assist_proposals(room_id, created_at desc);

create index user_flow_assist_unapplied_initiator_idx
  on public.user_flow_assist_proposals(initiating_user_id, room_id, created_at, task_id)
  where status = 'ready' and proposed_flow is not null and applied_at is null;

create unique index ai_tasks_one_active_user_flow_assist_per_initiator
  on public.ai_tasks(room_id, initiating_user_id)
  where kind = 'user_flow_assist'
    and status in ('queued', 'waiting_for_device', 'ready_to_run', 'running');

-- Queue an assist task and freeze its base flow. Gating mirrors
-- create_user_flow_generate_task (participant-with-edit OR room owner OR
-- workspace admin); is_org_admin was renamed to is_workspace_admin in
-- 202608110001, and this migration is later, so it calls is_workspace_admin.
create function public.create_user_flow_assist_task(
  target_room_id uuid,
  target_provider public.ai_provider default null,
  target_instruction text default null,
  target_base_flow jsonb default null,
  target_client_request_id uuid default null
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
  instruction text := nullif(btrim(coalesce(target_instruction, '')), '');
  existing_task_id uuid;
begin
  if caller_id is null
    or instruction is null
    or char_length(instruction) > 2000
    or target_base_flow is null
    or jsonb_typeof(target_base_flow) <> 'object'
    or pg_column_size(target_base_flow) > 262144
    or target_client_request_id is null
  then
    raise exception 'invalid_user_flow_assist_request' using errcode = 'P0001';
  end if;

  select room.workspace_id into target_workspace_id
  from public.rooms as room
  where room.id = target_room_id;

  if target_workspace_id is null
    or not exists (
      select 1 from public.room_participants as participant
      where participant.room_id = target_room_id
        and participant.user_id = caller_id
        and (
          participant.access = 'edit'
          or exists (
            select 1 from public.rooms as owner_room
            where owner_room.id = target_room_id
              and owner_room.owner_id = caller_id
          )
          or public.is_workspace_admin(target_workspace_id)
        )
    )
  then
    raise exception 'invalid_user_flow_assist_request' using errcode = 'P0001';
  end if;

  -- Idempotency: a resubmitted client_request_id returns the first task.
  select proposal.task_id into existing_task_id
  from public.user_flow_assist_proposals as proposal
  where proposal.room_id = target_room_id
    and proposal.client_request_id = target_client_request_id;
  if existing_task_id is not null then
    select task.* into result_task from public.ai_tasks as task where task.id = existing_task_id;
    return jsonb_build_object(
      'id', result_task.id, 'roomId', result_task.room_id,
      'provider', result_task.provider, 'kind', result_task.kind,
      'status', result_task.status, 'createdAt', result_task.created_at,
      'updatedAt', result_task.updated_at
    );
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(target_room_id::text || ':' || caller_id::text, 19)
  );

  -- One active assist per initiator: return the in-flight one if present.
  select task.* into result_task
  from public.ai_tasks as task
  where task.room_id = target_room_id
    and task.initiating_user_id = caller_id
    and task.kind = 'user_flow_assist'
    and task.status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
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

  if resolved_device_id is null or resolved_provider is null
    or not exists (
      select 1 from public.execution_devices as device
      where device.id = resolved_device_id and device.user_id = caller_id
        and device.status = 'active' and device.revoked_at is null
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
    raise exception 'invalid_user_flow_assist_request' using errcode = 'P0001';
  end if;

  frozen_manifest := jsonb_build_object(
    'messageIds', (select coalesce(jsonb_agg(m.id order by m.created_at, m.id), '[]'::jsonb)
      from public.messages as m where m.room_id = target_room_id),
    'attachmentIds', (select coalesce(jsonb_agg(a.id order by a.created_at, a.id), '[]'::jsonb)
      from public.attachments as a where a.room_id = target_room_id
        and a.message_id is not null and a.discard_pending = false),
    'evidenceIds', (select coalesce(jsonb_agg(e.id order by e.created_at, e.id), '[]'::jsonb)
      from public.evidence as e where e.room_id = target_room_id),
    'decisionIds', (select coalesce(jsonb_agg(d.id order by d.created_at, d.id), '[]'::jsonb)
      from public.decisions as d where d.room_id = target_room_id)
  );

  insert into public.ai_tasks (
    initiating_user_id, workspace_id, room_id, device_id, provider, kind,
    status, instruction, context_manifest_json, context_revision
  ) values (
    caller_id, target_workspace_id, target_room_id, resolved_device_id,
    resolved_provider, 'user_flow_assist', 'queued',
    left(instruction, 20000), frozen_manifest, 0
  ) returning * into result_task;

  insert into public.user_flow_assist_proposals (
    task_id, room_id, workspace_id, initiating_user_id, client_request_id,
    base_flow, instruction, status
  ) values (
    result_task.id, target_room_id, target_workspace_id, caller_id,
    target_client_request_id, target_base_flow, left(instruction, 20000), 'pending'
  );

  return jsonb_build_object(
    'id', result_task.id, 'roomId', result_task.room_id,
    'provider', result_task.provider, 'kind', result_task.kind,
    'status', result_task.status, 'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_user_flow_assist_task(uuid, public.ai_provider, text, jsonb, uuid)
  from public, anon, service_role;
grant execute on function public.create_user_flow_assist_task(uuid, public.ai_provider, text, jsonb, uuid)
  to authenticated;

-- Materialize a completed/failed assist task onto its proposal row.
create function public.materialize_user_flow_assist_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.user_flow_assist_proposals%rowtype;
  payload jsonb;
  result_flow jsonb;
  result_clarification text;
begin
  if new.kind <> 'user_flow_assist' then
    return new;
  end if;

  select proposal.* into request
  from public.user_flow_assist_proposals as proposal
  where proposal.task_id = new.id
  for update;
  if request.task_id is null or request.status in ('ready', 'dismissed') then
    return new;
  end if;

  -- Failure/cancel path: settle on the statement carrying the reason.
  if new.status = 'cancelled'
    or (
      new.status in ('failed', 'needs_review', 'needs_reauthentication', 'usage_limit_reached')
      and new.error_code is not null
    )
  then
    update public.user_flow_assist_proposals
    set status = 'failed',
        error_code = case when new.status = 'cancelled' then 'cancelled' else new.error_code end,
        settled_at = now(), updated_at = now()
    where task_id = request.task_id;
    return new;
  end if;

  if new.status <> 'completed' or new.result_json is null then
    return new;
  end if;

  payload := new.result_json -> 'payload';
  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or coalesce(new.result_json ->> 'partial', 'false') <> 'false'
  then
    update public.user_flow_assist_proposals
    set status = 'failed', error_code = 'malformed_output',
        settled_at = now(), updated_at = now()
    where task_id = request.task_id;
    return new;
  end if;

  result_flow := case
    when jsonb_typeof(payload -> 'flow') = 'object' then payload -> 'flow' else null
  end;
  result_clarification := nullif(btrim(coalesce(payload ->> 'clarifyingQuestion', '')), '');

  -- Exactly one outcome, and a proposed flow must look structurally like a flow.
  if (result_flow is null) = (result_clarification is null)
    or (result_flow is not null and (
      jsonb_typeof(result_flow -> 'title') <> 'string'
      or jsonb_typeof(result_flow -> 'nodes') <> 'array'
      or jsonb_typeof(result_flow -> 'edges') <> 'array'
    ))
    or (result_clarification is not null and char_length(result_clarification) > 2000)
  then
    update public.user_flow_assist_proposals
    set status = 'failed', error_code = 'malformed_output',
        settled_at = now(), updated_at = now()
    where task_id = request.task_id;
    return new;
  end if;

  update public.user_flow_assist_proposals
  set status = 'ready',
      proposed_flow = result_flow,
      clarifying_question = result_clarification,
      error_code = null,
      settled_at = now(), updated_at = now()
  where task_id = request.task_id;
  return new;
end;
$$;

create trigger ai_tasks_materialize_user_flow_assist_outcome
  after update on public.ai_tasks
  for each row execute function public.materialize_user_flow_assist_outcome();

alter table public.user_flow_assist_proposals enable row level security;
revoke all on table public.user_flow_assist_proposals from anon, authenticated, service_role;
grant select on table public.user_flow_assist_proposals to authenticated, service_role;
create policy "Room participants can view user flow assist proposals"
on public.user_flow_assist_proposals for select to authenticated
using (public.is_room_participant(room_id));

create function public.get_user_flow_assist_proposal(target_task_id uuid)
returns table(
  task_id uuid, room_id uuid, status public.user_flow_assist_status,
  proposed_flow jsonb, clarifying_question text,
  error_code public.task_error_code, created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select p.task_id, p.room_id, p.status, p.proposed_flow, p.clarifying_question,
    p.error_code, p.created_at
  from public.user_flow_assist_proposals as p
  where p.task_id = target_task_id
    and p.initiating_user_id = auth.uid()
    and public.is_room_participant(p.room_id);
$$;

revoke all on function public.get_user_flow_assist_proposal(uuid)
  from public, anon, service_role;
grant execute on function public.get_user_flow_assist_proposal(uuid) to authenticated;

create function public.list_unapplied_user_flow_assist_proposals(target_room_id uuid)
returns table(
  task_id uuid, room_id uuid, status public.user_flow_assist_status,
  proposed_flow jsonb, clarifying_question text,
  error_code public.task_error_code, created_at timestamptz
)
language sql
security definer
set search_path = ''
as $$
  select p.task_id, p.room_id, p.status, p.proposed_flow, p.clarifying_question,
    p.error_code, p.created_at
  from public.user_flow_assist_proposals as p
  where p.room_id = target_room_id
    and p.initiating_user_id = auth.uid()
    and p.status = 'ready'
    and p.proposed_flow is not null
    and p.applied_at is null
    and public.is_room_participant(p.room_id)
  order by p.created_at, p.task_id;
$$;

revoke all on function public.list_unapplied_user_flow_assist_proposals(uuid)
  from public, anon, service_role;
grant execute on function public.list_unapplied_user_flow_assist_proposals(uuid) to authenticated;

create function public.mark_user_flow_assist_proposal_applied(target_task_id uuid)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.user_flow_assist_proposals as p
  set applied_at = coalesce(p.applied_at, now()), updated_at = now()
  where p.task_id = target_task_id
    and p.initiating_user_id = auth.uid()
    and public.can_edit_room(p.room_id);
  return found;
end;
$$;

revoke all on function public.mark_user_flow_assist_proposal_applied(uuid)
  from public, anon, service_role;
grant execute on function public.mark_user_flow_assist_proposal_applied(uuid) to authenticated;

-- Enrich hydration so the connector receives the frozen base flow as
-- context.existingFlow for user_flow_assist tasks. Preserve the current
-- implementation (which chains design + user-flow-generate enrichment).
alter function public.hydrate_authorized_room_context(uuid, uuid)
  rename to hydrate_authorized_room_context_pre_user_flow_assist;

revoke all on function public.hydrate_authorized_room_context_pre_user_flow_assist(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context_pre_user_flow_assist(uuid, uuid)
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
  base_flow jsonb;
  target_device_id uuid;
begin
  hydrated_result := public.hydrate_authorized_room_context_pre_user_flow_assist(
    target_task_id, target_attempt_id
  );

  if hydrated_result ->> 'status' <> 'ready'
    or hydrated_result #>> '{context,kind}' <> 'user_flow_assist'
  then
    return hydrated_result;
  end if;

  select proposal.base_flow into base_flow
  from public.user_flow_assist_proposals as proposal
  where proposal.task_id = target_task_id;

  if base_flow is null then
    return hydrated_result;
  end if;

  hydrated_context := (hydrated_result -> 'context')
    || jsonb_build_object('existingFlow', base_flow);

  if octet_length(hydrated_context::text) > 524288 then
    select task.device_id into target_device_id
    from public.ai_tasks as task where task.id = target_task_id;
    perform public.settle_ai_task(
      target_task_id, target_device_id, target_attempt_id,
      'fail', 'unknown', 'Hydrated AI task context exceeds 512 KiB.', null, false
    );
    return jsonb_build_object('status', 'rejected', 'reason', 'context_too_large');
  end if;

  return jsonb_set(hydrated_result, '{context}', hydrated_context);
end;
$$;

revoke all on function public.hydrate_authorized_room_context(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context(uuid, uuid)
  to service_role;
