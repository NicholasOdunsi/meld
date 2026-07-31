-- Exactly-once Product Agent room replies.
--
-- A Discovery Room @Product Agent mention turns into one visible AI reply.
-- Three things make that reply exactly-once and auditable:
--
--   1. A room-reply task is bound to the human source message it answers, and
--      a partial unique index makes a second room-reply task for the same
--      source impossible -- one mention, one task, one eventual reply.
--   2. public.messages gains provenance: a message is either a 'human' post
--      (author_id set, no AI columns) or a 'product_agent' reply (no author_id,
--      but initiated_by + ai_task_id + provider set, plus the citations,
--      assumptions and suggested questions the model produced). Two check
--      constraints make any other shape unstorable.
--   3. settle_ai_task, when it completes a room_reply, inserts the one agent
--      message inside the settlement transaction with
--      `on conflict (ai_task_id) do nothing`. The attempt fingerprint already
--      makes a duplicate identical settlement a no-op that returns the same
--      terminal status; the conflict clause is the second belt-and-braces
--      guarantee that a task can back at most one message.
--
-- LOCK ORDER. settle_ai_task is unchanged in the order it takes row locks:
--
--   execution_devices  (FOR UPDATE)
--     -> ai_tasks       (FOR UPDATE)
--       -> ai_task_attempts (FOR UPDATE)
--         -> messages   (INSERT, leaf)
--
-- The message INSERT is the last thing the function does before it settles the
-- attempt, and it is a leaf: it acquires only the new row's lock plus the FK
-- KEY SHARE locks on rows the function already holds FOR UPDATE (the ai_task it
-- just locked) or on immutable parents (discovery_rooms, auth.users). No
-- function in the tree ever locks public.messages and then waits on ai_tasks,
-- so this extends the existing execution_devices -> ai_tasks -> ai_task_attempts
-- chain by one leaf without creating a second lock order. create_room_reply_task
-- takes no explicit row locks at all -- it does existence checks and one INSERT,
-- exactly like create_ai_task -- so it cannot participate in a cycle either.

-- Bind a room-reply task to the human message it answers. The composite FK
-- keeps the source message in the same room as the task; ON DELETE RESTRICT
-- stops a bound source message from being deleted out from under a live task.
alter table public.ai_tasks
  add column source_message_id uuid,
  add foreign key (source_message_id, room_id)
    references public.messages(id, room_id) on delete restrict;

-- One mention, one room-reply task. The partial index is scoped to room_reply
-- so later task kinds are never constrained by it, and creation returns the
-- existing task on conflict rather than raising.
create unique index ai_tasks_one_room_reply_per_source
  on public.ai_tasks (source_message_id)
  where kind = 'room_reply';

-- Message author provenance: a human post or a Product Agent reply, nothing
-- else. Kept as a DB-only enum -- there is no @meld/contracts counterpart, and
-- the enum-parity check only compares enums that both sides declare.
create type public.message_author_type as enum (
  'human', 'product_agent'
);

-- A CHECK cannot contain a subquery, so the per-element length bound on the
-- text arrays lives in this immutable helper. It stays callable by public so
-- the constraint can be evaluated by whichever role performs the write.
create function public.ai_message_text_array_ok(
  target_values text[],
  max_count integer,
  max_length integer
)
returns boolean
language sql
immutable
set search_path = ''
as $$
  select cardinality(coalesce(target_values, '{}'::text[])) <= max_count
    and not exists (
      select 1
      from unnest(coalesce(target_values, '{}'::text[])) as value
      where char_length(value) > max_length
    );
$$;

-- Add provenance to messages. author_id loses NOT NULL because a Product Agent
-- message has no human author; author_type defaults to 'human' so every
-- existing row and every ordinary post stays a human message with no change.
alter table public.messages
  alter column author_id drop not null,
  add column author_type public.message_author_type
    not null default 'human',
  add column initiated_by uuid references auth.users(id),
  add column ai_task_id uuid unique references public.ai_tasks(id),
  add column provider public.ai_provider,
  add column cited_message_ids uuid[] not null default '{}',
  add column cited_evidence_ids uuid[] not null default '{}',
  add column assumptions text[] not null default '{}',
  add column suggested_next_questions text[] not null default '{}';

-- The two valid provenance shapes. A human message carries an author and no AI
-- provenance or AI-only arrays; a Product Agent message carries no author but
-- the full AI provenance triple. Anything else is unstorable.
alter table public.messages
  add constraint messages_human_provenance check (
    author_type <> 'human'
    or (
      author_id is not null
      and initiated_by is null
      and ai_task_id is null
      and provider is null
      and cited_message_ids = '{}'::uuid[]
      and cited_evidence_ids = '{}'::uuid[]
      and assumptions = '{}'::text[]
      and suggested_next_questions = '{}'::text[]
    )
  ),
  add constraint messages_product_agent_provenance check (
    author_type <> 'product_agent'
    or (
      author_id is null
      and initiated_by is not null
      and ai_task_id is not null
      and provider is not null
    )
  ),
  add constraint messages_assumptions_bounds
    check (public.ai_message_text_array_ok(assumptions, 20, 2000)),
  add constraint messages_suggested_next_questions_bounds
    check (public.ai_message_text_array_ok(suggested_next_questions, 5, 2000));

-- Create a room-reply task bound to a human source message the caller owns.
-- Mirrors create_ai_task's checks (participant, active owned device, ready
-- provider connection) but resolves the device/provider from the caller's
-- saved default (or an explicit provider override), freezes the manifest from
-- the room's current content server-side, and is idempotent per source message.
create function public.create_room_reply_task(
  target_source_message_id uuid,
  target_provider public.ai_provider default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  source_room_id uuid;
  source_author_id uuid;
  source_author_type public.message_author_type;
  source_body text;
  target_organization_id uuid;
  resolved_device_id uuid;
  resolved_provider public.ai_provider;
  frozen_manifest jsonb;
  result_task public.ai_tasks%rowtype;
begin
  if caller_id is null then
    raise exception 'invalid_room_reply_request' using errcode = 'P0001';
  end if;

  -- Bind to the human source message. Unknown, non-human, and not-owned are one
  -- error so a caller probing message ids learns nothing about which it hit.
  select message.room_id, message.author_id, message.author_type, message.body
  into source_room_id, source_author_id, source_author_type, source_body
  from public.messages as message
  where message.id = target_source_message_id;

  if source_room_id is null
    or source_author_type <> 'human'
    or source_author_id is null
    or source_author_id <> caller_id
    or not public.is_room_participant(source_room_id)
  then
    raise exception 'invalid_room_reply_request' using errcode = 'P0001';
  end if;

  -- Idempotent per source message: a second mention-driven request returns the
  -- task the first one created rather than queueing another reply.
  select task.*
  into result_task
  from public.ai_tasks as task
  where task.source_message_id = target_source_message_id
    and task.kind = 'room_reply'
  limit 1;

  if result_task.id is null then
    select room.organization_id
    into target_organization_id
    from public.discovery_rooms as room
    where room.id = source_room_id;

    if target_organization_id is null then
      raise exception 'invalid_room_reply_request' using errcode = 'P0001';
    end if;

    -- Explicit provider or saved default; the device is always the caller's
    -- saved default device. Half a default (device without provider) is
    -- forbidden by ai_user_preferences, so either both resolve or neither does.
    select preference.default_device_id,
           coalesce(target_provider, preference.default_provider)
    into resolved_device_id, resolved_provider
    from public.ai_user_preferences as preference
    where preference.user_id = caller_id;

    if resolved_device_id is null or resolved_provider is null then
      raise exception 'invalid_room_reply_request' using errcode = 'P0001';
    end if;

    if not exists (
      select 1
      from public.execution_devices as device
      where device.id = resolved_device_id
        and device.user_id = caller_id
        and device.status = 'active'
        and device.revoked_at is null
    ) then
      raise exception 'invalid_room_reply_request' using errcode = 'P0001';
    end if;

    -- A provider that cannot run a task now is no provider: installed,
    -- authenticated and supported are all required.
    if not exists (
      select 1
      from public.provider_connections as connection
      where connection.device_id = resolved_device_id
        and connection.user_id = caller_id
        and connection.provider = resolved_provider
        and connection.installation = 'installed'
        and connection.authentication = 'authenticated'
        and connection.compatibility = 'supported'
    ) then
      raise exception 'invalid_room_reply_request' using errcode = 'P0001';
    end if;

    -- Freeze the authorized manifest from the room's current content, matching
    -- buildAuthorizedRoomContextManifest: message-linked, non-discarded
    -- attachments only.
    frozen_manifest := jsonb_build_object(
      'messageIds', (
        select coalesce(
          jsonb_agg(message.id order by message.created_at, message.id),
          '[]'::jsonb
        )
        from public.messages as message
        where message.room_id = source_room_id
      ),
      'attachmentIds', (
        select coalesce(
          jsonb_agg(attachment.id order by attachment.created_at, attachment.id),
          '[]'::jsonb
        )
        from public.attachments as attachment
        where attachment.room_id = source_room_id
          and attachment.message_id is not null
          and attachment.discard_pending = false
      ),
      'evidenceIds', (
        select coalesce(
          jsonb_agg(evidence.id order by evidence.created_at, evidence.id),
          '[]'::jsonb
        )
        from public.evidence as evidence
        where evidence.room_id = source_room_id
      ),
      'decisionIds', (
        select coalesce(
          jsonb_agg(decision.id order by decision.created_at, decision.id),
          '[]'::jsonb
        )
        from public.decisions as decision
        where decision.room_id = source_room_id
      )
    );

    -- The source message body is the caller's instruction to the agent. It is
    -- already 1..20000 characters by the messages body constraint.
    begin
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
        context_revision,
        source_message_id
      )
      values (
        caller_id,
        target_organization_id,
        source_room_id,
        resolved_device_id,
        resolved_provider,
        'room_reply',
        'queued',
        regexp_replace(
          source_body,
          '^[[:space:]]+|[[:space:]]+$',
          '',
          'g'
        ),
        frozen_manifest,
        0,
        target_source_message_id
      )
      returning * into result_task;
    exception
      when unique_violation then
        -- A concurrent request won the one-reply-per-source index; return its
        -- task instead of failing the caller.
        select task.*
        into result_task
        from public.ai_tasks as task
        where task.source_message_id = target_source_message_id
          and task.kind = 'room_reply'
        limit 1;
    end;
  end if;

  return jsonb_build_object(
    'id', result_task.id,
    'initiatingUserId', result_task.initiating_user_id,
    'organizationId', result_task.organization_id,
    'roomId', result_task.room_id,
    'deviceId', result_task.device_id,
    'provider', result_task.provider,
    'kind', result_task.kind,
    'status', result_task.status,
    'instruction', result_task.instruction,
    'contextManifest', result_task.context_manifest_json,
    'contextRevision', result_task.context_revision,
    'sourceMessageId', result_task.source_message_id,
    'result', result_task.result_json,
    'errorCode', result_task.error_code,
    'errorMessage', result_task.error_message,
    'cancelledAt', result_task.cancelled_at,
    'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_room_reply_task(
  uuid, public.ai_provider
) from public;
revoke all on function public.create_room_reply_task(
  uuid, public.ai_provider
) from anon, authenticated, service_role;
grant execute on function public.create_room_reply_task(
  uuid, public.ai_provider
) to authenticated;

-- Safe room task status projection for participants. Returns only what a
-- participant may see -- identifiers, provider, status, timestamps -- and never
-- the instruction, context manifest, result, error detail, attempt, or events.
-- Revoked room access removes visibility because the participant check fails.
create function public.list_room_ai_task_statuses(
  target_room_id uuid
)
returns table (
  task_id uuid,
  source_message_id uuid,
  initiating_user_id uuid,
  provider public.ai_provider,
  status public.ai_task_status,
  created_at timestamptz,
  updated_at timestamptz
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_room_participant(target_room_id) then
    return;
  end if;

  return query
  select
    task.id,
    task.source_message_id,
    task.initiating_user_id,
    task.provider,
    task.status,
    task.created_at,
    task.updated_at
  from public.ai_tasks as task
  where task.room_id = target_room_id
  order by task.created_at, task.id;
end;
$$;

revoke all on function public.list_room_ai_task_statuses(uuid) from public;
revoke all on function public.list_room_ai_task_statuses(uuid)
  from anon, authenticated, service_role;
grant execute on function public.list_room_ai_task_statuses(uuid)
  to authenticated;

-- Close the per-mention uniqueness hole: create_ai_task is granted to
-- authenticated and never sets source_message_id, so it could mint unbound
-- room_reply tasks that dodge the one-reply-per-source index (nulls do not
-- collide there) and double-post. Replace it at the same 6-argument signature,
-- preserving every existing guard verbatim, and refuse room_reply -- that kind
-- must go through create_room_reply_task, which binds the source message.
create or replace function public.create_ai_task(
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

  -- A room_reply must bind the human message it answers so a mention produces
  -- at most one reply; that binding lives only in create_room_reply_task.
  if target_kind = 'room_reply' then
    raise exception 'room_reply_requires_source_message'
      using errcode = 'P0001';
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

-- Extend settlement so a completed room_reply persists exactly one Product
-- Agent message atomically. Everything the prior settle_ai_task guaranteed is
-- preserved verbatim -- the device -> task -> attempt lock order, the settled
-- fingerprint replay/conflict logic, the staleness fence, the status mapping,
-- and the task/attempt updates. The only addition is the room_reply branch:
-- before completion it validates the result payload against the frozen manifest
-- and inserts the message. A partial result never reaches the insert branch.
create or replace function public.settle_ai_task(
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
  active_device_id uuid;
  current_task public.ai_tasks%rowtype;
  current_attempt public.ai_task_attempts%rowtype;
  canonical_json jsonb;
  canonical_fingerprint bytea;
  target_status public.ai_task_status;
  reply_valid boolean := true;
  reply_error_message text;
  reply_payload jsonb;
  reply_response text;
  reply_cited_message_ids uuid[];
  reply_cited_evidence_ids uuid[];
  reply_assumptions text[];
  reply_suggested_next_questions text[];
  manifest_message_ids uuid[];
  manifest_evidence_ids uuid[];
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

  select device.id
  into active_device_id
  from public.execution_devices as device
  where device.id = target_device_id
    and device.status = 'active'
    and device.revoked_at is null
  for update;

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

  if active_device_id is null
    or current_task.id is null
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

  -- Room-reply completion is the only path that produces a Product Agent
  -- message. Validate the payload against the frozen manifest. Validation
  -- failure is NOT raised: raising left the attempt unsettled and the task
  -- stranded in `running` until the lease reaper (the gateway's complete
  -- handler has no path to re-settle a rejected room reply). Instead an invalid
  -- or partial completion settles terminally to needs_review with the same
  -- malformed_output error the fail path already uses, and posts no message, so
  -- the gateway sees an ordinary terminal settlement. A partial result never
  -- yields a message.
  if current_task.kind = 'room_reply'
    and target_operation = 'complete'
  then
    if target_partial
      or target_result is null
      or jsonb_typeof(target_result) <> 'object'
      or jsonb_typeof(target_result -> 'payload') <> 'object'
    then
      reply_valid := false;
    else
      reply_payload := target_result -> 'payload';
      reply_response := reply_payload ->> 'response';

      if reply_response is null
        or char_length(
          regexp_replace(
            reply_response,
            '^[[:space:]]+|[[:space:]]+$',
            '',
            'g'
          )
        ) not between 1 and 20000
        or jsonb_typeof(reply_payload -> 'citedMessageIds') <> 'array'
        or jsonb_typeof(reply_payload -> 'citedEvidenceIds') <> 'array'
        or jsonb_typeof(reply_payload -> 'assumptions') <> 'array'
        or jsonb_typeof(reply_payload -> 'suggestedNextQuestions') <> 'array'
        or jsonb_array_length(reply_payload -> 'citedMessageIds') > 100
        or jsonb_array_length(reply_payload -> 'citedEvidenceIds') > 100
        or jsonb_array_length(reply_payload -> 'assumptions') > 20
        or jsonb_array_length(reply_payload -> 'suggestedNextQuestions') > 5
      then
        reply_valid := false;
      else
        begin
          select coalesce(array_agg(value::uuid), '{}'::uuid[])
          into reply_cited_message_ids
          from jsonb_array_elements_text(
            reply_payload -> 'citedMessageIds'
          ) as value;

          select coalesce(array_agg(value::uuid), '{}'::uuid[])
          into reply_cited_evidence_ids
          from jsonb_array_elements_text(
            reply_payload -> 'citedEvidenceIds'
          ) as value;
        exception
          when invalid_text_representation then
            reply_valid := false;
        end;

        if reply_valid then
          select coalesce(array_agg(value), '{}'::text[])
          into reply_assumptions
          from jsonb_array_elements_text(
            reply_payload -> 'assumptions'
          ) as value;

          select coalesce(array_agg(value), '{}'::text[])
          into reply_suggested_next_questions
          from jsonb_array_elements_text(
            reply_payload -> 'suggestedNextQuestions'
          ) as value;

          if exists (
            select 1
            from unnest(reply_assumptions) as value
            where char_length(
              regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g')
            ) not between 1 and 2000
          ) or exists (
            select 1
            from unnest(reply_suggested_next_questions) as value
            where char_length(
              regexp_replace(value, '^[[:space:]]+|[[:space:]]+$', '', 'g')
            ) not between 1 and 2000
          ) then
            reply_valid := false;
          end if;
        end if;

        if reply_valid then
          -- Citations must be a subset of the frozen manifest: the agent cannot
          -- cite anything the task was not authorized to read.
          select coalesce(array_agg(value::uuid), '{}'::uuid[])
          into manifest_message_ids
          from jsonb_array_elements_text(
            current_task.context_manifest_json -> 'messageIds'
          ) as value;

          select coalesce(array_agg(value::uuid), '{}'::uuid[])
          into manifest_evidence_ids
          from jsonb_array_elements_text(
            current_task.context_manifest_json -> 'evidenceIds'
          ) as value;

          if not (reply_cited_message_ids <@ manifest_message_ids)
            or not (reply_cited_evidence_ids <@ manifest_evidence_ids)
          then
            reply_valid := false;
          end if;
        end if;
      end if;
    end if;

    if not reply_valid then
      target_status := 'needs_review';
      reply_error_message :=
        'The Product Agent reply failed validation and was not posted.';
    end if;
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
        when not reply_valid then 'malformed_output'::public.task_error_code
        else null
      end,
      error_message = case
        when target_operation = 'fail' then target_message
        when not reply_valid then reply_error_message
        else null
      end,
      cancelled_at = case
        when target_status = 'cancelled' then now()
        else cancelled_at
      end,
      updated_at = now()
  where id = target_task_id;

  -- Insert the one Product Agent message. `on conflict (ai_task_id) do nothing`
  -- makes a task back at most one message even if this path is somehow reached
  -- twice; the settled-fingerprint replay above already returns before here on
  -- an identical retry, so the common idempotent case never re-inserts at all.
  if current_task.kind = 'room_reply'
    and target_operation = 'complete'
    and reply_valid
  then
    insert into public.messages (
      room_id,
      client_id,
      author_type,
      author_id,
      initiated_by,
      ai_task_id,
      provider,
      body,
      cited_message_ids,
      cited_evidence_ids,
      assumptions,
      suggested_next_questions
    )
    values (
      current_task.room_id,
      current_task.id,
      'product_agent',
      null,
      current_task.initiating_user_id,
      current_task.id,
      current_task.provider,
      target_result -> 'payload' ->> 'response',
      reply_cited_message_ids,
      reply_cited_evidence_ids,
      reply_assumptions,
      reply_suggested_next_questions
    )
    on conflict (ai_task_id) do nothing;
  end if;

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

-- Human write policies now require author_type = 'human' and author_id =
-- auth.uid(). A Product Agent message can only be written by the security
-- definer settlement path (service-role settlement), never by an authenticated
-- client directly, because these WITH CHECK clauses reject author_type =
-- 'product_agent'. SELECT is unchanged: participants still read every message
-- in their room, human or agent.
drop policy "Participants can post their messages" on public.messages;
create policy "Participants can post their messages"
on public.messages for insert to authenticated
with check (
  author_type = 'human'
  and author_id = auth.uid()
  and public.is_room_participant(room_id)
);

drop policy "Authors can update their messages" on public.messages;
create policy "Authors can update their messages"
on public.messages for update to authenticated
using (
  author_type = 'human'
  and author_id = auth.uid()
  and public.is_room_participant(room_id)
)
with check (
  author_type = 'human'
  and author_id = auth.uid()
  and public.is_room_participant(room_id)
);

drop policy "Authors can delete their messages" on public.messages;
create policy "Authors can delete their messages"
on public.messages for delete to authenticated
using (
  author_type = 'human'
  and author_id = auth.uid()
  and public.is_room_participant(room_id)
);
