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
    check (
      char_length(
        regexp_replace(
          instruction,
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        )
      ) between 1 and 20000
    ),
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
    or char_length(
      regexp_replace(
        target_instruction,
        '^[[:space:]]+|[[:space:]]+$',
        '',
        'g'
      )
    ) not between 1 and 20000
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
    regexp_replace(
      target_instruction,
      '^[[:space:]]+|[[:space:]]+$',
      '',
      'g'
    ),
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

create function public.claim_ai_task(
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

  select coalesce(max(attempt.attempt_no), 0) + 1
  into next_attempt_no
  from public.ai_task_attempts as attempt
  where attempt.task_id = target_task_id;

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
    'instruction', claimed_task.instruction
  );
end;
$$;

revoke all on function public.claim_ai_task(uuid, uuid) from public;
revoke all on function public.claim_ai_task(uuid, uuid)
  from anon, authenticated, service_role;
grant execute on function public.claim_ai_task(uuid, uuid) to service_role;

create function public.append_ai_task_event(
  target_task_id uuid,
  target_device_id uuid,
  target_attempt_id uuid,
  target_sequence bigint,
  target_type text,
  target_payload jsonb
)
returns bigint
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_task public.ai_tasks%rowtype;
  current_attempt public.ai_task_attempts%rowtype;
  stored_event public.ai_task_events%rowtype;
  expected_sequence bigint;
begin
  select task.*
  into current_task
  from public.ai_tasks as task
  where task.id = target_task_id
  for update;

  select attempt.*
  into current_attempt
  from public.ai_task_attempts as attempt
  where attempt.id = target_attempt_id
    and attempt.task_id = target_task_id
  for update;

  if current_task.id is null
    or current_attempt.id is null
    or current_task.status <> 'running'
    or current_task.device_id <> target_device_id
    or current_attempt.device_id <> target_device_id
    or current_attempt.settled_at is not null
    or current_attempt.lease_expires_at <= now()
  then
    raise exception 'stale_ai_task_attempt' using errcode = 'P0001';
  end if;

  select event.*
  into stored_event
  from public.ai_task_events as event
  where event.attempt_id = target_attempt_id
    and event.sequence = target_sequence;

  if found then
    if stored_event.type = target_type
      and stored_event.payload_json = target_payload
    then
      return target_sequence;
    end if;

    raise exception 'conflicting_ai_task_event' using errcode = 'P0001';
  end if;

  select coalesce(max(event.sequence), 0) + 1
  into expected_sequence
  from public.ai_task_events as event
  where event.attempt_id = target_attempt_id;

  if target_sequence <> expected_sequence then
    raise exception 'out_of_order_ai_task_event' using errcode = 'P0001';
  end if;

  insert into public.ai_task_events (
    task_id,
    attempt_id,
    sequence,
    type,
    payload_json
  )
  values (
    target_task_id,
    target_attempt_id,
    target_sequence,
    target_type,
    target_payload
  );

  update public.ai_task_attempts
  set lease_expires_at = now() + public.ai_task_lease_duration()
  where id = target_attempt_id;

  return target_sequence;
end;
$$;

revoke all on function public.append_ai_task_event(
  uuid, uuid, uuid, bigint, text, jsonb
) from public;
revoke all on function public.append_ai_task_event(
  uuid, uuid, uuid, bigint, text, jsonb
) from anon, authenticated, service_role;
grant execute on function public.append_ai_task_event(
  uuid, uuid, uuid, bigint, text, jsonb
) to service_role;

create function public.renew_ai_task_leases(
  target_device_id uuid,
  target_attempts jsonb
)
returns table (
  task_id uuid,
  attempt_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if target_attempts is null
    or jsonb_typeof(target_attempts) <> 'array'
    or jsonb_array_length(target_attempts) > 32
  then
    raise exception 'invalid_ai_task_lease_batch' using errcode = 'P0001';
  end if;

  return query
  with requested as (
    select request."taskId" as task_id, request."attemptId" as attempt_id
    from jsonb_to_recordset(target_attempts) as request(
      "taskId" uuid,
      "attemptId" uuid
    )
  )
  update public.ai_task_attempts as attempt
  set lease_expires_at = now() + public.ai_task_lease_duration()
  from requested,
       public.ai_tasks as task
  where attempt.id = requested.attempt_id
    and attempt.task_id = requested.task_id
    and task.id = attempt.task_id
    and task.device_id = target_device_id
    and task.status = 'running'
    and attempt.settled_at is null
    and attempt.device_id = target_device_id
    and attempt.lease_expires_at > now()
  returning attempt.task_id, attempt.id;
end;
$$;

revoke all on function public.renew_ai_task_leases(uuid, jsonb) from public;
revoke all on function public.renew_ai_task_leases(uuid, jsonb)
  from anon, authenticated, service_role;
grant execute on function public.renew_ai_task_leases(uuid, jsonb)
  to service_role;

create function public.settle_ai_task(
  target_task_id uuid,
  target_device_id uuid,
  target_attempt_id uuid,
  target_operation public.ai_task_settle_operation,
  target_code public.task_error_code,
  target_message text,
  target_result jsonb,
  target_partial boolean
)
returns public.ai_task_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_task public.ai_tasks%rowtype;
  current_attempt public.ai_task_attempts%rowtype;
  canonical_json jsonb;
  canonical_fingerprint bytea;
  target_status public.ai_task_status;
begin
  canonical_json := jsonb_build_object(
    'operation', target_operation,
    'code', target_code,
    'message', target_message,
    'result', target_result,
    'partial', target_partial
  );
  canonical_fingerprint := extensions.digest(
    convert_to(canonical_json::text, 'utf8'),
    'sha256'
  );

  select task.*
  into current_task
  from public.ai_tasks as task
  where task.id = target_task_id
  for update;

  select attempt.*
  into current_attempt
  from public.ai_task_attempts as attempt
  where attempt.id = target_attempt_id
    and attempt.task_id = target_task_id
  for update;

  if current_task.id is null
    or current_attempt.id is null
    or current_task.device_id <> target_device_id
    or current_attempt.device_id <> target_device_id
  then
    raise exception 'stale_ai_task_attempt' using errcode = 'P0001';
  end if;

  if current_attempt.settled_at is not null then
    if current_attempt.settle_operation = target_operation
      and current_attempt.settle_fingerprint = canonical_fingerprint
    then
      return current_attempt.outcome;
    end if;

    raise exception 'conflicting_ai_task_settlement' using errcode = 'P0001';
  end if;

  if current_task.status <> 'running'
    or current_attempt.lease_expires_at <= now()
  then
    raise exception 'stale_ai_task_attempt' using errcode = 'P0001';
  end if;

  if target_operation = 'complete' then
    target_status := 'completed';
  elsif target_operation = 'fail' then
    target_status := (
      case target_code
        when 'authentication_required' then 'needs_reauthentication'
        when 'usage_limit_reached' then 'usage_limit_reached'
        when 'malformed_output' then 'needs_review'
        when 'execution_abandoned' then 'needs_review'
        when 'cancelled' then 'cancelled'
        else 'failed'
      end
    )::public.ai_task_status;
  else
    raise exception 'invalid_ai_task_settlement' using errcode = 'P0001';
  end if;

  perform public.transition_ai_task(
    target_task_id,
    target_status,
    'running'
  );

  update public.ai_tasks
  set result_json = case
        when target_operation = 'complete' or target_partial
          then target_result
        else null
      end,
      error_code = case
        when target_operation = 'fail' then target_code
        else null
      end,
      error_message = case
        when target_operation = 'fail' then target_message
        else null
      end,
      cancelled_at = case
        when target_status = 'cancelled' then now()
        else cancelled_at
      end,
      updated_at = now()
  where id = target_task_id;

  update public.ai_task_attempts
  set settled_at = now(),
      outcome = target_status,
      settle_operation = target_operation,
      settle_fingerprint = canonical_fingerprint
  where id = target_attempt_id;

  return target_status;
end;
$$;

revoke all on function public.settle_ai_task(
  uuid, uuid, uuid, public.ai_task_settle_operation,
  public.task_error_code, text, jsonb, boolean
) from public;
revoke all on function public.settle_ai_task(
  uuid, uuid, uuid, public.ai_task_settle_operation,
  public.task_error_code, text, jsonb, boolean
) from anon, authenticated, service_role;
grant execute on function public.settle_ai_task(
  uuid, uuid, uuid, public.ai_task_settle_operation,
  public.task_error_code, text, jsonb, boolean
) to service_role;

create function public.acknowledge_task_cancellation(
  target_task_id uuid,
  target_attempt_id uuid,
  target_device_id uuid
)
returns public.ai_task_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_attempt public.ai_task_attempts%rowtype;
begin
  select attempt.*
  into current_attempt
  from public.ai_task_attempts as attempt
  where attempt.id = target_attempt_id
    and attempt.task_id = target_task_id
  for update;

  if current_attempt.id is null
    or current_attempt.device_id <> target_device_id
    or current_attempt.settled_at is null
    or current_attempt.settle_operation <> 'cancelled'
    or current_attempt.cancel_requested_at is null
  then
    raise exception 'stale_ai_task_attempt' using errcode = 'P0001';
  end if;

  update public.ai_task_attempts
  set cancel_acknowledged_at = coalesce(cancel_acknowledged_at, now())
  where id = target_attempt_id;

  return current_attempt.outcome;
end;
$$;

revoke all on function public.acknowledge_task_cancellation(
  uuid, uuid, uuid
) from public;
revoke all on function public.acknowledge_task_cancellation(
  uuid, uuid, uuid
) from anon, authenticated, service_role;
grant execute on function public.acknowledge_task_cancellation(
  uuid, uuid, uuid
) to service_role;

create function public.reap_expired_ai_task_leases()
returns table (
  task_id uuid,
  attempt_id uuid,
  outcome public.ai_task_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_attempt record;
  target_outcome public.ai_task_status;
begin
  for expired_attempt in
    select
      attempt.task_id as task_id_value,
      attempt.id as attempt_id_value,
      (
        select count(*)
        from public.ai_task_events as event
        where event.attempt_id = attempt.id
      ) as event_count
    from public.ai_tasks as task
    join public.ai_task_attempts as attempt on attempt.task_id = task.id
    where attempt.settled_at is null
      and attempt.lease_expires_at <= now()
      and task.status = 'running'
    order by attempt.lease_expires_at, attempt.id
    for update of task, attempt skip locked
  loop
    target_outcome := (
      case
        when expired_attempt.event_count = 0 then 'waiting_for_device'
        else 'needs_review'
      end
    )::public.ai_task_status;

    perform public.transition_ai_task(
      expired_attempt.task_id_value,
      target_outcome,
      'running'
    );

    update public.ai_tasks
    set result_json = null,
        error_code = case
          when expired_attempt.event_count = 0 then null
          else 'execution_abandoned'::public.task_error_code
        end,
        error_message = case
          when expired_attempt.event_count = 0 then null
          else 'AI task execution lease expired after events were recorded.'
        end,
        updated_at = now()
    where id = expired_attempt.task_id_value;

    task_id := expired_attempt.task_id_value;
    attempt_id := expired_attempt.attempt_id_value;
    outcome := target_outcome;
    return next;
  end loop;
end;
$$;

revoke all on function public.reap_expired_ai_task_leases() from public;
revoke all on function public.reap_expired_ai_task_leases()
  from anon, authenticated, service_role;
grant execute on function public.reap_expired_ai_task_leases()
  to service_role;

create function public.get_ai_task_lease_seconds()
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select extract(
    epoch from public.ai_task_lease_duration()
  )::integer;
$$;

revoke all on function public.get_ai_task_lease_seconds() from public;
revoke all on function public.get_ai_task_lease_seconds()
  from anon, authenticated, service_role;
grant execute on function public.get_ai_task_lease_seconds()
  to service_role;

create function public.get_execution_device_for_auth(
  target_device_id uuid
)
returns table (
  id uuid,
  user_id uuid,
  token_hash text,
  status public.execution_device_status
)
language sql
stable
security definer
set search_path = ''
as $$
  select
    device.id,
    device.user_id,
    device.token_hash,
    device.status
  from public.execution_devices as device
  where device.id = target_device_id;
$$;

revoke all on function public.get_execution_device_for_auth(uuid)
  from public;
revoke all on function public.get_execution_device_for_auth(uuid)
  from anon, authenticated, service_role;
grant execute on function public.get_execution_device_for_auth(uuid)
  to service_role;

create function public.record_device_connection(
  target_device_id uuid,
  target_connector_version text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  update public.execution_devices
  set last_seen_at = now(),
      connector_version = left(target_connector_version, 100)
  where id = target_device_id
    and status = 'active'
    and revoked_at is null;

  if not found then
    raise exception 'invalid_execution_device' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.record_device_connection(uuid, text)
  from public;
revoke all on function public.record_device_connection(uuid, text)
  from anon, authenticated, service_role;
grant execute on function public.record_device_connection(uuid, text)
  to service_role;

create function public.upsert_provider_connections(
  target_device_id uuid,
  target_statuses jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_user_id uuid;
begin
  select device.user_id
  into target_user_id
  from public.execution_devices as device
  where device.id = target_device_id
    and device.status = 'active'
    and device.revoked_at is null;

  if target_user_id is null then
    raise exception 'invalid_provider_connections' using errcode = 'P0001';
  end if;

  if target_statuses is null
    or jsonb_typeof(target_statuses) <> 'array'
  then
    raise exception 'invalid_provider_connections' using errcode = 'P0001';
  end if;

  if jsonb_array_length(target_statuses) > 2 then
    raise exception 'invalid_provider_connections' using errcode = 'P0001';
  end if;

  if exists (
      select 1
      from jsonb_array_elements(target_statuses) as item
      where jsonb_typeof(item) <> 'object'
        or item ->> 'provider' is null
        or item ->> 'installation' is null
        or not item ? 'version'
        or item ->> 'authentication' is null
        or item ->> 'compatibility' is null
        or item ->> 'provider' not in ('codex', 'claude')
        or item ->> 'installation' not in (
          'not_installed', 'installing', 'installed',
          'update_required', 'failed'
        )
        or item ->> 'authentication' not in (
          'authenticated', 'signed_out', 'unknown'
        )
        or item ->> 'compatibility' not in (
          'supported', 'outdated', 'unavailable'
        )
    )
    or (
      select count(*) <> count(distinct item ->> 'provider')
      from jsonb_array_elements(target_statuses) as item
    )
  then
    raise exception 'invalid_provider_connections' using errcode = 'P0001';
  end if;

  insert into public.provider_connections (
    user_id,
    device_id,
    provider,
    installation,
    version,
    authentication,
    compatibility,
    last_seen_at
  )
  select
    target_user_id,
    target_device_id,
    (item ->> 'provider')::public.ai_provider,
    (
      item ->> 'installation'
    )::public.provider_installation_status,
    item ->> 'version',
    (
      item ->> 'authentication'
    )::public.provider_authentication_status,
    (
      item ->> 'compatibility'
    )::public.provider_compatibility_status,
    now()
  from jsonb_array_elements(target_statuses) as item
  on conflict (device_id, provider) do update
  set provider = excluded.provider,
      installation = excluded.installation,
      version = excluded.version,
      authentication = excluded.authentication,
      compatibility = excluded.compatibility,
      last_seen_at = excluded.last_seen_at;
end;
$$;

revoke all on function public.upsert_provider_connections(uuid, jsonb)
  from public;
revoke all on function public.upsert_provider_connections(uuid, jsonb)
  from anon, authenticated, service_role;
grant execute on function public.upsert_provider_connections(uuid, jsonb)
  to service_role;

create function public.list_dispatchable_ai_tasks(
  connected_device_ids uuid[]
)
returns table (
  kind text,
  task_id uuid,
  device_id uuid,
  status public.ai_task_status,
  attempt_id uuid
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  connected_devices uuid[];
begin
  select coalesce(
    array_agg(distinct connected.connected_id),
    '{}'::uuid[]
  )
  into connected_devices
  from unnest(
    coalesce(connected_device_ids, '{}'::uuid[])
  ) as connected(connected_id);

  with locked_tasks as materialized (
    select task.id
    from public.ai_tasks as task
    where task.status in (
      'queued', 'waiting_for_device', 'ready_to_run'
    )
    order by task.id
    for update
  )
  update public.ai_tasks as task
  set status = (
        case
          when task.device_id = any(connected_devices)
            then 'ready_to_run'
          else 'waiting_for_device'
        end
      )::public.ai_task_status,
      updated_at = now()
  from locked_tasks
  where task.id = locked_tasks.id
    and task.status <> (
      case
        when task.device_id = any(connected_devices)
          then 'ready_to_run'
        else 'waiting_for_device'
      end
    )::public.ai_task_status;

  return query
  select
    'available'::text,
    task.id,
    task.device_id,
    task.status,
    null::uuid
  from public.ai_tasks as task
  where task.status = 'ready_to_run'
    and task.device_id = any(connected_devices)

  union all

  select
    'cancel'::text,
    task.id,
    task.device_id,
    'cancelled'::public.ai_task_status,
    attempt.id
  from public.ai_tasks as task
  join public.ai_task_attempts as attempt
    on attempt.task_id = task.id
  where task.status = 'cancelled'
    and task.device_id = any(connected_devices)
    and attempt.settled_at is not null
    and attempt.settle_operation = 'cancelled'
    and attempt.cancel_requested_at is not null
    and attempt.cancel_requested_at >= now() - interval '24 hours'
    and attempt.cancel_acknowledged_at is null

  order by 2, 1;
end;
$$;

revoke all on function public.list_dispatchable_ai_tasks(uuid[])
  from public;
revoke all on function public.list_dispatchable_ai_tasks(uuid[])
  from anon, authenticated, service_role;
grant execute on function public.list_dispatchable_ai_tasks(uuid[])
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
  current_task public.ai_tasks%rowtype;
  current_attempt public.ai_task_attempts%rowtype;
  hydrated_messages jsonb;
  hydrated_attachments jsonb;
  hydrated_evidence jsonb;
  hydrated_decisions jsonb;
  hydrated_context jsonb;
begin
  select task.*
  into current_task
  from public.ai_tasks as task
  where task.id = target_task_id
  for update;

  select attempt.*
  into current_attempt
  from public.ai_task_attempts as attempt
  where attempt.id = target_attempt_id
    and attempt.task_id = target_task_id
  for update;

  if current_task.id is null
    or current_attempt.id is null
    or current_task.status <> 'running'
    or current_task.device_id <> current_attempt.device_id
    or current_attempt.settled_at is not null
    or current_attempt.lease_expires_at <= now()
  then
    raise exception 'stale_ai_task_attempt' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.room_participants as participant
    join public.memberships as membership
      on membership.user_id = participant.user_id
    join public.discovery_rooms as room
      on room.id = participant.room_id
      and room.organization_id = membership.organization_id
    where participant.room_id = current_task.room_id
      and participant.user_id = current_task.initiating_user_id
  ) then
    perform public.settle_ai_task(
      current_task.id,
      current_task.device_id,
      current_attempt.id,
      'fail',
      'permission_changed',
      'Room access changed before AI task execution.',
      null,
      false
    );
    return jsonb_build_object(
      'status', 'rejected',
      'reason', 'permission_changed'
    );
  end if;

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', message.id,
        'authorName', coalesce(
          nullif(btrim(author.raw_user_meta_data ->> 'display_name'), ''),
          nullif(btrim(author.raw_user_meta_data ->> 'full_name'), ''),
          nullif(btrim(author.raw_user_meta_data ->> 'name'), ''),
          nullif(split_part(author.email, '@', 1), ''),
          message.author_id::text
        ),
        'text', message.body,
        'createdAt', to_char(
          message.created_at at time zone 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        )
      )
      order by message.created_at, message.id
    ),
    '[]'::jsonb
  )
  into hydrated_messages
  from public.messages as message
  join auth.users as author on author.id = message.author_id
  where message.room_id = current_task.room_id
    and message.id in (
      select value::uuid
      from jsonb_array_elements_text(
        current_task.context_manifest_json -> 'messageIds'
      ) as value
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', attachment.id,
        'name', attachment.original_name,
        'mimeType', attachment.mime_type,
        'extractedText', (
          case
            when attachment.extraction_status = 'ready'
              then attachment.extracted_text
            else null
          end
        ),
        'userCaption', attachment.caption
      )
      order by attachment.created_at, attachment.id
    ),
    '[]'::jsonb
  )
  into hydrated_attachments
  from public.attachments as attachment
  where attachment.room_id = current_task.room_id
    and attachment.id in (
      select value::uuid
      from jsonb_array_elements_text(
        current_task.context_manifest_json -> 'attachmentIds'
      ) as value
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', evidence.id,
        'title', evidence.title,
        'note', evidence.note
      )
      order by evidence.created_at, evidence.id
    ),
    '[]'::jsonb
  )
  into hydrated_evidence
  from public.evidence as evidence
  where evidence.room_id = current_task.room_id
    and evidence.id in (
      select value::uuid
      from jsonb_array_elements_text(
        current_task.context_manifest_json -> 'evidenceIds'
      ) as value
    );

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'id', decision.id,
        'summary', decision.summary,
        'sourceMessageId', decision.source_message_id
      )
      order by decision.created_at, decision.id
    ),
    '[]'::jsonb
  )
  into hydrated_decisions
  from public.decisions as decision
  where decision.room_id = current_task.room_id
    and decision.id in (
      select value::uuid
      from jsonb_array_elements_text(
        current_task.context_manifest_json -> 'decisionIds'
      ) as value
    );

  hydrated_context := jsonb_build_object(
    'taskId', current_task.id,
    'initiatingUserId', current_task.initiating_user_id,
    'organizationId', current_task.organization_id,
    'roomId', current_task.room_id,
    'kind', current_task.kind,
    'instruction', current_task.instruction,
    'messages', hydrated_messages,
    'attachments', hydrated_attachments,
    'evidence', hydrated_evidence,
    'decisions', hydrated_decisions
  );

  if octet_length(hydrated_context::text) > 524288 then
    perform public.settle_ai_task(
      current_task.id,
      current_task.device_id,
      current_attempt.id,
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

  return jsonb_build_object(
    'status', 'ready',
    'context', hydrated_context
  );
end;
$$;

revoke all on function public.hydrate_authorized_room_context(uuid, uuid)
  from public;
revoke all on function public.hydrate_authorized_room_context(uuid, uuid)
  from anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context(uuid, uuid)
  to service_role;

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
