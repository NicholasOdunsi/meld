create extension if not exists pgcrypto with schema extensions;

create type public.ai_provider as enum ('codex', 'claude');
create type public.ai_task_kind as enum (
  'room_reply', 'prd_generate', 'prd_revise', 'stage_readiness'
);
create type public.ai_task_status as enum (
  'queued', 'waiting_for_device', 'ready_to_run', 'running',
  'needs_reauthentication', 'usage_limit_reached', 'needs_review',
  'completed', 'cancelled', 'failed'
);
create type public.ai_task_settle_operation as enum (
  'complete', 'fail', 'cancelled'
);
create type public.provider_installation_status as enum (
  'not_installed', 'installing', 'installed', 'update_required', 'failed'
);
create type public.provider_authentication_status as enum (
  'authenticated', 'signed_out', 'unknown'
);
create type public.provider_compatibility_status as enum (
  'supported', 'outdated', 'unavailable'
);
create type public.task_error_code as enum (
  'authentication_required',
  'usage_limit_reached',
  'provider_unavailable',
  'provider_install_failed',
  'connector_outdated',
  'permission_changed',
  'security_boundary_violated',
  'malformed_output',
  'execution_abandoned',
  'cancelled',
  'unknown'
);
create type public.execution_device_status as enum ('active', 'revoked');

alter table public.discovery_rooms
  add constraint discovery_rooms_id_organization_id_key
  unique (id, organization_id);

create table public.execution_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  name text not null,
  platform text not null,
  token_hash text not null unique,
  status public.execution_device_status not null default 'active',
  connector_version text,
  last_seen_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  unique (id, user_id)
);

create index execution_devices_user_id_idx
  on public.execution_devices (user_id);

create table public.provider_connections (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  device_id uuid not null,
  provider public.ai_provider not null,
  installation public.provider_installation_status not null,
  version text,
  authentication public.provider_authentication_status not null,
  compatibility public.provider_compatibility_status not null,
  last_seen_at timestamptz,
  unique (device_id, provider),
  foreign key (device_id, user_id)
    references public.execution_devices(id, user_id) on delete cascade
);

create index provider_connections_user_id_idx
  on public.provider_connections (user_id);

create table public.ai_tasks (
  id uuid primary key default gen_random_uuid(),
  initiating_user_id uuid not null references auth.users(id),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  room_id uuid not null,
  device_id uuid not null,
  provider public.ai_provider not null,
  kind public.ai_task_kind not null,
  status public.ai_task_status not null default 'queued',
  instruction text not null,
  context_manifest_json jsonb not null,
  context_revision integer not null default 0 check (context_revision >= 0),
  result_json jsonb,
  error_code public.task_error_code,
  error_message text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (id, device_id),
  foreign key (device_id, initiating_user_id)
    references public.execution_devices(id, user_id),
  foreign key (room_id, organization_id)
    references public.discovery_rooms(id, organization_id) on delete cascade
);

alter table public.ai_tasks
  add constraint ai_tasks_instruction_length
    check (char_length(instruction) between 1 and 20000),
  add constraint ai_tasks_manifest_size
    check (pg_column_size(context_manifest_json) <= 262144),
  add constraint ai_tasks_result_size
    check (result_json is null or pg_column_size(result_json) <= 262144);

create index ai_tasks_room_created_at_idx
  on public.ai_tasks (room_id, created_at, id);
create index ai_tasks_device_status_idx
  on public.ai_tasks (device_id, status, created_at);

create table public.ai_task_attempts (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.ai_tasks(id) on delete cascade,
  device_id uuid not null,
  attempt_no integer not null check (attempt_no > 0),
  started_at timestamptz not null default now(),
  lease_expires_at timestamptz not null,
  settled_at timestamptz,
  outcome public.ai_task_status,
  settle_operation public.ai_task_settle_operation,
  settle_fingerprint bytea,
  cancel_requested_at timestamptz,
  cancel_acknowledged_at timestamptz,
  unique (id, task_id),
  unique (task_id, attempt_no),
  foreign key (task_id, device_id)
    references public.ai_tasks(id, device_id) on delete cascade
);

create unique index ai_task_attempts_one_current
  on public.ai_task_attempts (task_id)
  where settled_at is null;

create table public.ai_task_events (
  task_id uuid not null references public.ai_tasks(id) on delete cascade,
  attempt_id uuid not null,
  sequence bigint not null check (sequence > 0),
  type text not null,
  payload_json jsonb not null,
  created_at timestamptz not null default now(),
  primary key (attempt_id, sequence),
  foreign key (attempt_id, task_id)
    references public.ai_task_attempts(id, task_id) on delete cascade
);

alter table public.ai_task_events
  add constraint ai_task_events_payload_size
    check (pg_column_size(payload_json) <= 65536);

create index ai_task_events_task_id_idx
  on public.ai_task_events (task_id);

create function public.ai_task_lease_duration()
returns interval
language sql
immutable
set search_path = ''
as $$
  select interval '90 seconds';
$$;

revoke all on function public.ai_task_lease_duration() from public;
revoke all on function public.ai_task_lease_duration()
  from anon, authenticated, service_role;

create function public.transition_ai_task(
  p_task_id uuid,
  p_to public.ai_task_status,
  p_from public.ai_task_status
)
returns public.ai_task_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_status public.ai_task_status;
  settlement_operation public.ai_task_settle_operation;
  settlement_json jsonb;
begin
  select task.status
  into current_status
  from public.ai_tasks as task
  where task.id = p_task_id
  for update;

  if current_status is null
    or current_status <> p_from
    or not (
      (p_from = 'queued' and p_to in (
        'waiting_for_device', 'ready_to_run', 'cancelled', 'failed'
      ))
      or (p_from = 'waiting_for_device' and p_to in (
        'ready_to_run', 'cancelled', 'failed'
      ))
      or (p_from = 'ready_to_run' and p_to in (
        'running', 'waiting_for_device', 'cancelled', 'failed'
      ))
      or (p_from = 'running' and p_to in (
        'completed', 'needs_review', 'needs_reauthentication',
        'usage_limit_reached', 'waiting_for_device', 'cancelled', 'failed'
      ))
      or (p_from = 'needs_reauthentication' and p_to in (
        'ready_to_run', 'cancelled', 'failed'
      ))
      or (p_from = 'usage_limit_reached' and p_to in (
        'ready_to_run', 'cancelled', 'failed'
      ))
      or (p_from = 'needs_review' and p_to in (
        'completed', 'ready_to_run', 'cancelled', 'failed'
      ))
    )
  then
    raise exception 'invalid_ai_task_transition' using errcode = 'P0001';
  end if;

  update public.ai_tasks
  set status = p_to,
      updated_at = now()
  where id = p_task_id;

  if p_from = 'running' then
    settlement_operation := (
      case
        when p_to = 'completed' then 'complete'
        when p_to = 'cancelled' then 'cancelled'
        else 'fail'
      end
    )::public.ai_task_settle_operation;
    settlement_json := jsonb_build_object(
      'operation', settlement_operation,
      'outcome', p_to
    );

    update public.ai_task_attempts
    set settled_at = now(),
        outcome = p_to,
        settle_operation = settlement_operation,
        settle_fingerprint = extensions.digest(
          convert_to(settlement_json::text, 'utf8'),
          'sha256'
        )
    where task_id = p_task_id
      and settled_at is null;
  end if;

  return p_to;
end;
$$;

revoke all on function public.transition_ai_task(
  uuid, public.ai_task_status, public.ai_task_status
) from public;
revoke all on function public.transition_ai_task(
  uuid, public.ai_task_status, public.ai_task_status
) from anon, authenticated, service_role;

create function public.create_ai_task(
  target_room_id uuid,
  target_device_id uuid,
  target_provider public.ai_provider,
  target_kind public.ai_task_kind,
  target_instruction text,
  target_manifest jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_organization_id uuid;
  message_ids uuid[];
  attachment_ids uuid[];
  evidence_ids uuid[];
  decision_ids uuid[];
  inserted_task public.ai_tasks%rowtype;
begin
  if caller_id is null then
    raise exception 'invalid_ai_task_request' using errcode = 'P0001';
  end if;

  select room.organization_id
  into target_organization_id
  from public.discovery_rooms as room
  where room.id = target_room_id;

  if target_organization_id is null
    or not public.is_room_participant(target_room_id)
  then
    raise exception 'invalid_ai_task_request' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.execution_devices as device
    where device.id = target_device_id
      and device.user_id = caller_id
      and device.status = 'active'
      and device.revoked_at is null
  ) then
    raise exception 'invalid_ai_task_request' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.provider_connections as connection
    where connection.device_id = target_device_id
      and connection.user_id = caller_id
      and connection.provider = target_provider
  ) then
    raise exception 'invalid_ai_task_request' using errcode = 'P0001';
  end if;

  if target_instruction is null
    or char_length(target_instruction) not between 1 and 20000
    or target_manifest is null
    or jsonb_typeof(target_manifest) <> 'object'
    or pg_column_size(target_manifest) > 262144
    or not target_manifest ?& array[
      'messageIds', 'attachmentIds', 'evidenceIds', 'decisionIds'
    ]
    or (
      select count(*) from jsonb_object_keys(target_manifest)
    ) <> 4
    or jsonb_typeof(target_manifest -> 'messageIds') <> 'array'
    or jsonb_typeof(target_manifest -> 'attachmentIds') <> 'array'
    or jsonb_typeof(target_manifest -> 'evidenceIds') <> 'array'
    or jsonb_typeof(target_manifest -> 'decisionIds') <> 'array'
    or jsonb_array_length(target_manifest -> 'messageIds') > 500
    or jsonb_array_length(target_manifest -> 'attachmentIds') > 50
    or jsonb_array_length(target_manifest -> 'evidenceIds') > 100
    or jsonb_array_length(target_manifest -> 'decisionIds') > 100
  then
    raise exception 'invalid_ai_task_request' using errcode = 'P0001';
  end if;

  if (
    select count(*) <> count(distinct item)
    from jsonb_array_elements_text(target_manifest -> 'messageIds') as item
  ) or (
    select count(*) <> count(distinct item)
    from jsonb_array_elements_text(target_manifest -> 'attachmentIds') as item
  ) or (
    select count(*) <> count(distinct item)
    from jsonb_array_elements_text(target_manifest -> 'evidenceIds') as item
  ) or (
    select count(*) <> count(distinct item)
    from jsonb_array_elements_text(target_manifest -> 'decisionIds') as item
  ) then
    raise exception 'invalid_ai_task_request' using errcode = 'P0001';
  end if;

  begin
    select coalesce(array_agg(item::uuid), '{}'::uuid[])
    into message_ids
    from jsonb_array_elements_text(
      target_manifest -> 'messageIds'
    ) as item;

    select coalesce(array_agg(item::uuid), '{}'::uuid[])
    into attachment_ids
    from jsonb_array_elements_text(
      target_manifest -> 'attachmentIds'
    ) as item;

    select coalesce(array_agg(item::uuid), '{}'::uuid[])
    into evidence_ids
    from jsonb_array_elements_text(
      target_manifest -> 'evidenceIds'
    ) as item;

    select coalesce(array_agg(item::uuid), '{}'::uuid[])
    into decision_ids
    from jsonb_array_elements_text(
      target_manifest -> 'decisionIds'
    ) as item;
  exception
    when invalid_text_representation then
      raise exception 'invalid_ai_task_request' using errcode = 'P0001';
  end;

  if cardinality(message_ids) <> (
    select count(*)
    from public.messages as message
    where message.id = any(message_ids)
      and message.room_id = target_room_id
  ) or cardinality(attachment_ids) <> (
    select count(*)
    from public.attachments as attachment
    where attachment.id = any(attachment_ids)
      and attachment.room_id = target_room_id
  ) or cardinality(evidence_ids) <> (
    select count(*)
    from public.evidence as evidence
    where evidence.id = any(evidence_ids)
      and evidence.room_id = target_room_id
  ) or cardinality(decision_ids) <> (
    select count(*)
    from public.decisions as decision
    where decision.id = any(decision_ids)
      and decision.room_id = target_room_id
  ) then
    raise exception 'invalid_ai_task_request' using errcode = 'P0001';
  end if;

  insert into public.ai_tasks (
    initiating_user_id,
    organization_id,
    room_id,
    device_id,
    provider,
    kind,
    status,
    instruction,
    context_manifest_json,
    context_revision
  )
  values (
    caller_id,
    target_organization_id,
    target_room_id,
    target_device_id,
    target_provider,
    target_kind,
    'queued',
    target_instruction,
    target_manifest,
    0
  )
  returning * into inserted_task;

  return jsonb_build_object(
    'id', inserted_task.id,
    'initiatingUserId', inserted_task.initiating_user_id,
    'organizationId', inserted_task.organization_id,
    'roomId', inserted_task.room_id,
    'deviceId', inserted_task.device_id,
    'provider', inserted_task.provider,
    'kind', inserted_task.kind,
    'status', inserted_task.status,
    'instruction', inserted_task.instruction,
    'contextManifest', inserted_task.context_manifest_json,
    'contextRevision', inserted_task.context_revision,
    'result', inserted_task.result_json,
    'errorCode', inserted_task.error_code,
    'errorMessage', inserted_task.error_message,
    'cancelledAt', inserted_task.cancelled_at,
    'createdAt', inserted_task.created_at,
    'updatedAt', inserted_task.updated_at
  );
end;
$$;

revoke all on function public.create_ai_task(
  uuid, uuid, public.ai_provider, public.ai_task_kind, text, jsonb
) from public;
revoke all on function public.create_ai_task(
  uuid, uuid, public.ai_provider, public.ai_task_kind, text, jsonb
) from anon, authenticated, service_role;
grant execute on function public.create_ai_task(
  uuid, uuid, public.ai_provider, public.ai_task_kind, text, jsonb
) to authenticated;

create function public.cancel_ai_task(target_task_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_task public.ai_tasks%rowtype;
  cancellation_json jsonb;
begin
  select task.*
  into current_task
  from public.ai_tasks as task
  where task.id = target_task_id
  for update;

  if current_task.id is null
    or caller_id is null
    or current_task.initiating_user_id <> caller_id
  then
    raise exception 'ai_task_not_owned' using errcode = 'P0001';
  end if;

  if current_task.status = 'running' then
    cancellation_json := jsonb_build_object(
      'operation', 'cancelled',
      'code', 'cancelled',
      'message', null,
      'result', null,
      'partial', false
    );

    update public.ai_task_attempts
    set settled_at = now(),
        outcome = 'cancelled',
        settle_operation = 'cancelled',
        settle_fingerprint = extensions.digest(
          convert_to(cancellation_json::text, 'utf8'),
          'sha256'
        ),
        cancel_requested_at = now()
    where task_id = target_task_id
      and settled_at is null;
  end if;

  perform public.transition_ai_task(
    target_task_id,
    'cancelled',
    current_task.status
  );

  update public.ai_tasks
  set cancelled_at = now(),
      updated_at = now()
  where id = target_task_id
  returning * into current_task;

  return to_jsonb(current_task);
end;
$$;

revoke all on function public.cancel_ai_task(uuid) from public;
revoke all on function public.cancel_ai_task(uuid)
  from anon, authenticated, service_role;
grant execute on function public.cancel_ai_task(uuid) to authenticated;

create function public.resolve_ai_task(
  target_task_id uuid,
  target_action text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  current_task public.ai_tasks%rowtype;
  target_status public.ai_task_status;
begin
  select task.*
  into current_task
  from public.ai_tasks as task
  where task.id = target_task_id
  for update;

  if current_task.id is null
    or caller_id is null
    or current_task.initiating_user_id <> caller_id
  then
    raise exception 'ai_task_not_owned' using errcode = 'P0001';
  end if;

  case
    when target_action = 'retry'
      and current_task.status in (
        'needs_reauthentication', 'usage_limit_reached', 'needs_review'
      )
      then target_status := 'ready_to_run';
    when target_action = 'accept' and current_task.status = 'needs_review'
      then target_status := 'completed';
    when target_action = 'discard' and current_task.status = 'needs_review'
      then target_status := 'cancelled';
    else
      raise exception 'invalid_ai_task_resolution' using errcode = 'P0001';
  end case;

  perform public.transition_ai_task(
    target_task_id,
    target_status,
    current_task.status
  );

  update public.ai_tasks
  set cancelled_at = case
        when target_status = 'cancelled' then now()
        else cancelled_at
      end,
      updated_at = now()
  where id = target_task_id
  returning * into current_task;

  return to_jsonb(current_task);
end;
$$;

revoke all on function public.resolve_ai_task(uuid, text) from public;
revoke all on function public.resolve_ai_task(uuid, text)
  from anon, authenticated, service_role;
grant execute on function public.resolve_ai_task(uuid, text) to authenticated;

alter table public.execution_devices enable row level security;
alter table public.provider_connections enable row level security;
alter table public.ai_tasks enable row level security;
alter table public.ai_task_attempts enable row level security;
alter table public.ai_task_events enable row level security;

revoke all on table public.execution_devices from anon;
revoke all on table public.provider_connections from anon;
revoke all on table public.ai_tasks from anon;
revoke all on table public.ai_task_attempts from anon;
revoke all on table public.ai_task_events from anon;

revoke all privileges
  on table public.execution_devices,
  public.provider_connections,
  public.ai_tasks,
  public.ai_task_attempts,
  public.ai_task_events
  from authenticated, service_role;

grant select
  on table public.execution_devices,
  public.provider_connections,
  public.ai_tasks,
  public.ai_task_attempts,
  public.ai_task_events
  to authenticated, service_role;

create policy "Users can view their execution devices"
on public.execution_devices
for select
to authenticated
using (user_id = auth.uid());

create policy "Users can view their provider connections"
on public.provider_connections
for select
to authenticated
using (user_id = auth.uid());

create policy "Room participants can view AI tasks"
on public.ai_tasks
for select
to authenticated
using (public.is_room_participant(room_id));

create policy "Room participants can view AI task attempts"
on public.ai_task_attempts
for select
to authenticated
using (
  exists (
    select 1
    from public.ai_tasks as task
    where task.id = ai_task_attempts.task_id
      and public.is_room_participant(task.room_id)
  )
);

create policy "Room participants can view AI task events"
on public.ai_task_events
for select
to authenticated
using (
  exists (
    select 1
    from public.ai_tasks as task
    where task.id = ai_task_events.task_id
      and public.is_room_participant(task.room_id)
  )
);
