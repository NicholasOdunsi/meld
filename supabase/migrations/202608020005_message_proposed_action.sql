alter table public.messages
  add column proposed_action jsonb;

alter table public.messages
  add constraint messages_human_proposed_action check (
    author_type <> 'human' or proposed_action is null
  ),
  add constraint messages_proposed_action_shape check (
    proposed_action is null
    or proposed_action = '{"kind":"prd_generate"}'::jsonb
  );

-- Re-create settlement from the current canonical hot-path body, changing
-- only validated proposedAction extraction and message persistence.
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
  reply_proposed_action jsonb;
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
      reply_proposed_action := case
        when reply_payload -> 'proposedAction'
          = '{"kind":"prd_generate"}'::jsonb
        then jsonb_build_object('kind', 'prd_generate')
        else null
      end;

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
      suggested_next_questions,
      proposed_action
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
      reply_suggested_next_questions,
      reply_proposed_action
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
