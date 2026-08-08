-- Unified PRD contextual assistance.
--
-- A `prd_section_assist` task is one composer submission: the user selects
-- 1-15 contiguous PRD sections, types once, and the Product Agent returns an
-- answer, a one-field edit proposal, both, or a clarifying question. Which of
-- the four it is only becomes known when inference finishes, so creation
-- writes nothing but the task and a pending request, and settlement -- not
-- creation -- decides whether the outcome becomes conversation messages, a
-- reviewable proposal, or both.
--
-- Forward-compatible by design: `prd_section_revise`, its RPC, its
-- materializer and its proposals keep working untouched, so tasks queued
-- before this ships still complete.
--
-- ENUM ORDERING NOTE. `alter type ... add value` cannot be followed by a use
-- of the new value in the same transaction ("unsafe use of new value"), and
-- the Supabase CLI wraps each migration file in one. Every reference to
-- 'prd_section_assist' below therefore lives inside a plpgsql function body,
-- which is not parsed until the function first runs. This is the same
-- arrangement 202608080001 used for 'prd_section_revise'.

alter type public.ai_task_kind add value if not exists 'prd_section_assist';

create type public.prd_assist_request_status as enum (
  'pending', 'ready', 'failed', 'dismissed'
);

-- A conversation message is an ordinary post. A prd_context message is one
-- half of a persisted PRD question/answer exchange. A prd_change message is
-- the compact record that an applied proposal leaves behind.
create type public.message_kind as enum (
  'conversation', 'prd_context', 'prd_change'
);

-- The single ordering authority on the SQL side, mirroring
-- `PRD_SECTION_ORDER` in packages/contracts/src/prd-fields.ts: the order a
-- reader sees, which is NOT the order PRDDocumentSchema declares its keys in
-- (mvpScope renders before risksAndMitigations). A contiguous selection is
-- validated against this, so ordering here and in the contracts must agree or
-- a legal drag-selection becomes unsubmittable.
create function public.prd_section_order()
returns text[]
language sql
immutable
set search_path = ''
as $$
  select array[
    'executiveSummary', 'problemAndEvidence', 'targetUsersAndUseCases',
    'goalsNonGoalsAndMetrics', 'proposedSolution', 'userJourneys',
    'functionalRequirements', 'nonFunctionalRequirements',
    'uxStatesAndEdgeCases', 'dependenciesAndConstraints', 'mvpScope',
    'risksAndMitigations', 'acceptanceCriteria', 'openQuestions',
    'decisionHistory'
  ]::text[];
$$;

revoke all on function public.prd_section_order() from public, anon, authenticated, service_role;

-- One row per composer submission. Everything the request was asked *about*
-- is frozen here at submission time -- the base PRD, each selected fragment,
-- and each selected field's value -- so a later PRD edit cannot rewrite the
-- context of an earlier question.
create table public.prd_assist_requests (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null,
  organization_id uuid not null,
  task_id uuid not null unique references public.ai_tasks(id) on delete cascade,
  -- Idempotency key: a resubmitted request returns the first one's ids
  -- rather than queueing a second task.
  client_request_id uuid not null,
  base_prd_id uuid not null references public.prds(id) on delete restrict,
  base_version integer not null check (base_version >= 1),
  -- The ordered [{field, label, quotedText}] fragments, exactly as validated.
  selected_sections jsonb not null,
  -- Every selected field mapped to its frozen value in the base PRD.
  selected_values jsonb not null,
  instruction text not null
    check (char_length(btrim(instruction)) between 1 and 20000),
  -- Frozen from the requester's room access. Authorization for the proposal
  -- half of an outcome never depends on what the model returns.
  can_propose_edit boolean not null,
  status public.prd_assist_request_status not null default 'pending',
  answer text check (
    answer is null or char_length(btrim(answer)) between 1 and 20000
  ),
  clarifying_question text check (
    clarifying_question is null
    or char_length(btrim(clarifying_question)) between 1 and 2000
  ),
  cited_message_ids uuid[] not null default '{}',
  cited_evidence_ids uuid[] not null default '{}',
  assumptions text[] not null default '{}'
    check (public.ai_message_text_array_ok(assumptions, 20, 2000)),
  suggested_next_questions text[] not null default '{}'
    check (public.ai_message_text_array_ok(suggested_next_questions, 5, 2000)),
  proposal_id uuid references public.prd_proposals(id) on delete set null,
  -- Why the edit half of an outcome could not be materialized. Public-safe by
  -- construction: a closed set of reasons, never provider or server detail.
  proposal_error_code text check (
    proposal_error_code is null
    or proposal_error_code in ('section_has_active_proposal', 'edit_not_permitted')
  ),
  -- The task's own public-safe failure code, when the task never produced a
  -- usable result. The free-text error_message on ai_tasks is deliberately
  -- not copied here: it is not participant-safe.
  error_code public.task_error_code,
  question_message_id uuid references public.messages(id) on delete set null,
  answer_message_id uuid references public.messages(id) on delete set null,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  settled_at timestamptz,
  unique (room_id, client_request_id),
  foreign key (room_id, organization_id)
    references public.discovery_rooms(id, organization_id) on delete cascade,
  constraint prd_assist_requests_selection_shape check (
    jsonb_typeof(selected_sections) = 'array'
    and jsonb_array_length(selected_sections) between 1 and 15
    and jsonb_typeof(selected_values) = 'object'
  ),
  -- The contract's exclusivity rule, restated where the data lives.
  constraint prd_assist_requests_clarification_exclusive check (
    clarifying_question is null
    or (answer is null and proposal_id is null)
  ),
  -- A view-only request can never end up owning a proposal, whatever a
  -- provider returns.
  constraint prd_assist_requests_view_only_has_no_proposal check (
    can_propose_edit or proposal_id is null
  )
);

create index prd_assist_requests_room_created_at_idx
  on public.prd_assist_requests (room_id, created_at desc, id desc);

-- Recovering "my requests still in flight" after a refresh.
create index prd_assist_requests_room_creator_status_idx
  on public.prd_assist_requests (room_id, created_by, status);

alter table public.prd_assist_requests enable row level security;
revoke all on table public.prd_assist_requests from anon;
revoke all on table public.prd_assist_requests from authenticated, service_role;
grant select on table public.prd_assist_requests to authenticated, service_role;

create policy "Room participants can view PRD assist requests"
on public.prd_assist_requests for select to authenticated
using (public.is_room_participant(room_id));

-- A proposal produced by an assist task points back at its request. A
-- proposal from the still-live prd_section_revise path has none.
alter table public.prd_proposals
  add column assist_request_id uuid
    references public.prd_assist_requests(id) on delete set null;

-- One request yields at most one proposal. prd_proposals.task_id is already
-- unique, which says the same thing from the task side; this says it from the
-- request side, so neither a second settlement nor a hand-written insert can
-- fan one request out into two edits.
create unique index prd_proposals_one_per_assist_request
  on public.prd_proposals (assist_request_id)
  where assist_request_id is not null;

-- Message provenance for PRD context. prd_context holds the same ordered
-- fragments as prd_assist_requests.selected_sections, stored on the row
-- rather than only referenced, so a Realtime INSERT payload can render the
-- frozen context with no follow-up join.
alter table public.messages
  add column kind public.message_kind not null default 'conversation',
  add column prd_assist_request_id uuid
    references public.prd_assist_requests(id) on delete set null,
  add column prd_proposal_id uuid
    references public.prd_proposals(id) on delete set null,
  add column prd_id uuid references public.prds(id) on delete set null,
  add column prd_version integer,
  add column prd_context jsonb;

alter table public.messages
  add constraint messages_conversation_kind_is_plain check (
    kind <> 'conversation'
    or (
      prd_assist_request_id is null
      and prd_proposal_id is null
      and prd_id is null
      and prd_version is null
      and prd_context is null
    )
  ),
  add constraint messages_prd_context_shape check (
    kind <> 'prd_context'
    or (
      prd_assist_request_id is not null
      and prd_proposal_id is null
      and prd_id is not null
      and prd_version is not null
      and jsonb_typeof(prd_context) = 'array'
      and jsonb_array_length(prd_context) between 1 and 15
    )
  ),
  add constraint messages_prd_change_shape check (
    kind <> 'prd_change'
    or (
      prd_proposal_id is not null
      and prd_id is not null
      and prd_version is not null
      and jsonb_typeof(prd_context) = 'array'
      and jsonb_array_length(prd_context) between 1 and 15
    )
  ),
  add constraint messages_prd_version_positive check (
    prd_version is null or prd_version >= 1
  );

-- Clients post ordinary conversation. Every PRD-context and PRD-change
-- message is written by a security-definer function, so restricting the
-- client write path costs nothing and removes the only way to forge a
-- message that claims PRD provenance.
drop policy "Participants can post their messages" on public.messages;
create policy "Participants can post their messages"
on public.messages for insert to authenticated
with check (
  author_type = 'human'
  and author_id = auth.uid()
  and kind = 'conversation'
  and public.is_room_participant(room_id)
);

drop policy "Authors can update their messages" on public.messages;
create policy "Authors can update their messages"
on public.messages for update to authenticated
using (
  author_type = 'human'
  and author_id = auth.uid()
  and kind = 'conversation'
  and public.is_room_participant(room_id)
)
with check (
  author_type = 'human'
  and author_id = auth.uid()
  and kind = 'conversation'
  and public.is_room_participant(room_id)
);

drop policy "Authors can delete their messages" on public.messages;
create policy "Authors can delete their messages"
on public.messages for delete to authenticated
using (
  author_type = 'human'
  and author_id = auth.uid()
  and kind = 'conversation'
  and public.is_room_participant(room_id)
);

-- Queue one assist task for an ordered multi-section selection.
--
-- Clones create_prd_section_revise_task's provider/device resolution and
-- manifest freezing. Three things differ: any room participant may call it
-- (asking is not editing); the scope is an ordered array rather than one
-- field; and it writes no proposal and no message, because the outcome is
-- unknown until the model answers.
create function public.create_prd_section_assist_task(
  target_room_id uuid,
  target_sections jsonb,
  target_instruction text,
  target_client_request_id uuid,
  target_provider public.ai_provider default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  target_organization_id uuid;
  resolved_device_id uuid;
  resolved_provider public.ai_provider;
  current_prd public.prds%rowtype;
  section_order text[] := public.prd_section_order();
  sections_valid boolean;
  total_quoted_chars integer;
  selected_fields text[];
  field_positions integer[];
  frozen_sections jsonb;
  frozen_values jsonb;
  frozen_scope jsonb;
  frozen_manifest jsonb;
  caller_can_edit boolean;
  existing_request public.prd_assist_requests%rowtype;
  result_task public.ai_tasks%rowtype;
  result_request public.prd_assist_requests%rowtype;
begin
  if caller_id is null
    or target_client_request_id is null
    or not public.is_room_participant(target_room_id)
    or char_length(btrim(coalesce(target_instruction, ''))) not between 1 and 20000
    or target_sections is null
    or jsonb_typeof(target_sections) <> 'array'
    or jsonb_array_length(target_sections) not between 1 and 15
  then
    raise exception 'invalid_prd_section_assist_request' using errcode = 'P0001';
  end if;

  -- Per-element shape and bounds. A CASE evaluates its branches in order, so
  -- the type guards genuinely protect the accessors that follow them; a
  -- chain of ANDs would not be guaranteed to short-circuit.
  select
    bool_and(
      case
        when jsonb_typeof(entry) <> 'object' then false
        when not (entry ?& array['field', 'label', 'quotedText']) then false
        when (select count(*) from jsonb_object_keys(entry)) <> 3 then false
        when jsonb_typeof(entry -> 'field') <> 'string' then false
        when jsonb_typeof(entry -> 'label') <> 'string' then false
        when jsonb_typeof(entry -> 'quotedText') <> 'string' then false
        when array_position(section_order, entry ->> 'field') is null then false
        when char_length(btrim(entry ->> 'label')) not between 1 and 200 then false
        when char_length(entry ->> 'quotedText') not between 1 and 10000 then false
        else true
      end
    ),
    coalesce(sum(char_length(coalesce(entry ->> 'quotedText', ''))), 0)::integer,
    array_agg(entry ->> 'field' order by position)
  into sections_valid, total_quoted_chars, selected_fields
  from jsonb_array_elements(target_sections)
    with ordinality as element(entry, position);

  if not coalesce(sections_valid, false) or total_quoted_chars > 20000 then
    raise exception 'invalid_prd_section_assist_request' using errcode = 'P0001';
  end if;

  select array_agg(array_position(section_order, field) order by position)
  into field_positions
  from unnest(selected_fields) with ordinality as selected(field, position);

  -- Unique fields, strictly ascending in rendered document order. Sorted and
  -- all-distinct together mean strictly increasing.
  if (select count(distinct field) from unnest(selected_fields) as field)
       <> cardinality(selected_fields)
    or field_positions is distinct from (
      select array_agg(position order by position)
      from unnest(field_positions) as position
    )
  then
    raise exception 'invalid_prd_section_assist_request' using errcode = 'P0001';
  end if;

  -- Serialize concurrent submissions of the same client request id so the
  -- idempotency lookup below cannot race a second insert.
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(
      target_room_id::text || ':' || target_client_request_id::text, 1
    )
  );

  select request.* into existing_request
  from public.prd_assist_requests as request
  where request.room_id = target_room_id
    and request.client_request_id = target_client_request_id;

  if existing_request.id is not null then
    select task.* into result_task
    from public.ai_tasks as task
    where task.id = existing_request.task_id;

    return jsonb_build_object(
      'taskId', result_task.id,
      'requestId', existing_request.id,
      'roomId', result_task.room_id,
      'provider', result_task.provider,
      'kind', result_task.kind,
      'status', result_task.status,
      'canProposeEdit', existing_request.can_propose_edit,
      'createdAt', result_task.created_at,
      'updatedAt', result_task.updated_at
    );
  end if;

  select room.organization_id into target_organization_id
  from public.discovery_rooms as room
  where room.id = target_room_id;

  select prd.* into current_prd
  from public.prds as prd
  where prd.room_id = target_room_id
  order by prd.version desc, prd.id desc
  limit 1;

  if target_organization_id is null or current_prd.id is null then
    raise exception 'invalid_prd_section_assist_request' using errcode = 'P0001';
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
    raise exception 'invalid_prd_section_assist_request' using errcode = 'P0001';
  end if;

  -- Computed from room access, never accepted from the client.
  caller_can_edit := public.can_edit_room(target_room_id);

  select coalesce(
    jsonb_agg(
      jsonb_build_object(
        'field', entry ->> 'field',
        'label', btrim(entry ->> 'label'),
        'quotedText', entry ->> 'quotedText'
      )
      order by position
    ),
    '[]'::jsonb
  )
  into frozen_sections
  from jsonb_array_elements(target_sections)
    with ordinality as element(entry, position);

  select coalesce(
    jsonb_object_agg(field, coalesce(current_prd.document -> field, 'null'::jsonb)),
    '{}'::jsonb
  )
  into frozen_values
  from unnest(selected_fields) as field;

  frozen_scope := jsonb_build_object(
    'sections', frozen_sections,
    'canProposeEdit', caller_can_edit
  );

  frozen_manifest := jsonb_build_object(
    'messageIds', (select coalesce(jsonb_agg(m.id order by m.created_at, m.id), '[]'::jsonb)
      from public.messages as m where m.room_id = target_room_id),
    'attachmentIds', (select coalesce(jsonb_agg(a.id order by a.created_at, a.id), '[]'::jsonb)
      from public.attachments as a where a.room_id = target_room_id
        and a.message_id is not null and a.discard_pending = false),
    'evidenceIds', (select coalesce(jsonb_agg(e.id order by e.created_at, e.id), '[]'::jsonb)
      from public.evidence as e where e.room_id = target_room_id),
    'decisionIds', (select coalesce(jsonb_agg(d.id order by d.created_at, d.id), '[]'::jsonb)
      from public.decisions as d where d.room_id = target_room_id),
    'prdAssistScope', frozen_scope,
    'existingPrd', jsonb_build_object(
      'version', current_prd.version,
      'document', current_prd.document
    )
  );

  insert into public.ai_tasks (
    initiating_user_id, organization_id, room_id, device_id, provider, kind,
    status, instruction, context_manifest_json, context_revision
  ) values (
    caller_id, target_organization_id, target_room_id, resolved_device_id,
    resolved_provider, 'prd_section_assist', 'queued',
    btrim(target_instruction), frozen_manifest, current_prd.version
  ) returning * into result_task;

  insert into public.prd_assist_requests (
    room_id, organization_id, task_id, client_request_id, base_prd_id,
    base_version, selected_sections, selected_values, instruction,
    can_propose_edit, created_by
  ) values (
    target_room_id, target_organization_id, result_task.id,
    target_client_request_id, current_prd.id, current_prd.version,
    frozen_sections, frozen_values, btrim(target_instruction),
    caller_can_edit, caller_id
  ) returning * into result_request;

  return jsonb_build_object(
    'taskId', result_task.id,
    'requestId', result_request.id,
    'roomId', result_task.room_id,
    'provider', result_task.provider,
    'kind', result_task.kind,
    'status', result_task.status,
    'canProposeEdit', result_request.can_propose_edit,
    'createdAt', result_task.created_at,
    'updatedAt', result_task.updated_at
  );
end;
$$;

revoke all on function public.create_prd_section_assist_task(
  uuid, jsonb, text, uuid, public.ai_provider
) from public, anon, authenticated, service_role;
grant execute on function public.create_prd_section_assist_task(
  uuid, jsonb, text, uuid, public.ai_provider
) to authenticated;

-- Hydration, restated whole.
--
-- Two things are fixed here at once. First, 202608080002 rebuilt this
-- function from the pre-202608040004 body while adding the section-task
-- branch, silently dropping the `existingPrd` attachment for prd_revise and
-- room_reply; both have been hydrating without a PRD ever since, and
-- supabase/tests/hydrate_existing_prd.test.sql has been failing three of its
-- four assertions on a clean database as a result. Second, a room reply now
-- receives the FULL current document rather than a title-only summary, which
-- is what makes the connector's room-reply-v6 instruction ("answer PRD
-- questions from existingPrd.document") true rather than aspirational.
--
-- Everything else is byte-for-byte the shipped behaviour: the same lock
-- order, the same staleness fence, the same participant re-check, the same
-- manifest-scoped reads, and the same 524288-byte guard that fails the task
-- rather than truncating it.
create or replace function public.hydrate_authorized_room_context(
  target_task_id uuid,
  target_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  active_device_id uuid;
  current_task public.ai_tasks%rowtype;
  current_attempt public.ai_task_attempts%rowtype;
  target_device_id uuid;
  hydrated_messages jsonb;
  hydrated_attachments jsonb;
  hydrated_evidence jsonb;
  hydrated_decisions jsonb;
  existing_prd jsonb;
  hydrated_context jsonb;
begin
  select task.device_id into target_device_id
  from public.ai_tasks as task
  where task.id = target_task_id;

  select device.id into active_device_id
  from public.execution_devices as device
  where device.id = target_device_id
    and device.status = 'active'
    and device.revoked_at is null
  for update;

  select task.* into current_task
  from public.ai_tasks as task
  where task.id = target_task_id
    and task.device_id = target_device_id
  for update;

  select attempt.* into current_attempt
  from public.ai_task_attempts as attempt
  where attempt.id = target_attempt_id
    and attempt.task_id = target_task_id
  for update;

  if active_device_id is null
    or current_task.id is null
    or current_attempt.id is null
    or current_task.status <> 'running'
    or current_task.device_id <> target_device_id
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
  ) into hydrated_messages
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
        'extractedText', case
          when attachment.extraction_status = 'ready'
            then attachment.extracted_text
          else null
        end,
        'userCaption', attachment.caption
      )
      order by attachment.created_at, attachment.id
    ),
    '[]'::jsonb
  ) into hydrated_attachments
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
  ) into hydrated_evidence
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
  ) into hydrated_decisions
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

  -- A section task carries its own frozen PRD in the manifest, so its
  -- context is read from there and never from the live document.
  if current_task.context_manifest_json ? 'targetSection' then
    hydrated_context := hydrated_context || jsonb_build_object(
      'targetSection', current_task.context_manifest_json -> 'targetSection',
      'existingPrd', current_task.context_manifest_json -> 'existingPrd'
    );
  elsif current_task.context_manifest_json ? 'prdAssistScope' then
    hydrated_context := hydrated_context || jsonb_build_object(
      'prdAssistScope', current_task.context_manifest_json -> 'prdAssistScope',
      'existingPrd', current_task.context_manifest_json -> 'existingPrd'
    );
  elsif current_task.kind in ('prd_revise', 'room_reply') then
    -- Both now get the whole document: a revision needs the base to edit, and
    -- a broad room question about the PRD cannot be answered from a title.
    select jsonb_build_object('version', prd.version, 'document', prd.document)
    into existing_prd
    from public.prds as prd
    where prd.room_id = current_task.room_id
    order by prd.version desc, prd.id desc
    limit 1;

    if existing_prd is not null then
      hydrated_context := hydrated_context
        || jsonb_build_object('existingPrd', existing_prd);
    end if;
  end if;

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
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context(uuid, uuid)
  to service_role;

-- Turn a settled assist task into durable state, in the settling transaction.
--
-- Five outcomes, one rule each:
--
--   answer only    -> ready; two prd_context messages; no proposal
--   edit only      -> ready; one ready proposal; no message
--   answer + edit  -> ready; two messages AND one proposal, atomically
--   clarification  -> ready; two prd_context messages; no proposal
--   failure        -> failed with the task's public-safe code; nothing else
--
-- Two kinds of "cannot materialize the edit" are deliberately NOT the same:
--
--   * A boundary violation -- a citation the manifest never contained, a
--     target field outside the frozen selection, or any proposal at all from
--     a requester whose frozen can_propose_edit is false -- means the result
--     is untrusted, so the whole settlement fails and nothing is written. The
--     connector's response schema already makes each of these impossible;
--     this is the second, independent barrier, because authorization must not
--     depend on model obedience.
--   * A race -- another participant's proposal is already active for the
--     target section -- is nobody's fault, so the answer half still lands and
--     only the edit half is marked unavailable, with a public-safe reason.
--     The active proposal is never overwritten or replaced.
create function public.materialize_prd_assist_outcome()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  request public.prd_assist_requests%rowtype;
  payload jsonb;
  result_answer text;
  result_clarification text;
  result_proposal jsonb;
  result_target_field text;
  result_target_label text;
  result_target_quote text;
  result_cited_message_ids uuid[] := '{}'::uuid[];
  result_cited_evidence_ids uuid[] := '{}'::uuid[];
  result_assumptions text[] := '{}'::text[];
  result_suggestions text[] := '{}'::text[];
  manifest_message_ids uuid[];
  manifest_evidence_ids uuid[];
  result_valid boolean := true;
  failure_code public.task_error_code;
  proposal_failure text;
  new_proposal_id uuid;
  new_question_message_id uuid;
  new_answer_message_id uuid;
  agent_body text;
begin
  if new.kind <> 'prd_section_assist' then
    return new;
  end if;

  select assist.* into request
  from public.prd_assist_requests as assist
  where assist.task_id = new.id
  for update;

  -- Only a pending request materializes. That single guard covers three
  -- cases at once: a replayed settlement, a request already dismissed, and
  -- the first of settle_ai_task's two updates (status flips to completed
  -- while result_json is still null, which falls through below).
  if request.id is null or request.status <> 'pending' then
    return new;
  end if;

  if new.status in (
    'failed', 'cancelled', 'needs_review', 'needs_reauthentication',
    'usage_limit_reached'
  ) then
    -- The task's error_code is a closed enum and safe to show a participant.
    -- ai_tasks.error_message is free text from a provider and is not copied.
    update public.prd_assist_requests
    set status = 'failed',
        error_code = coalesce(new.error_code, 'unknown'),
        settled_at = now(),
        updated_at = now()
    where id = request.id;
    return new;
  end if;

  if new.status <> 'completed' or new.result_json is null then
    return new;
  end if;

  payload := new.result_json -> 'payload';

  if payload is null
    or jsonb_typeof(payload) <> 'object'
    or coalesce(new.result_json ->> 'partial', 'false') <> 'false'
    or (payload ? 'answer' and jsonb_typeof(payload -> 'answer') not in ('string', 'null'))
    or (payload ? 'clarifyingQuestion'
        and jsonb_typeof(payload -> 'clarifyingQuestion') not in ('string', 'null'))
    or (payload ? 'proposal' and jsonb_typeof(payload -> 'proposal') not in ('object', 'null'))
  then
    result_valid := false;
    failure_code := 'malformed_output';
  else
    result_answer := nullif(btrim(coalesce(payload ->> 'answer', '')), '');
    result_clarification :=
      nullif(btrim(coalesce(payload ->> 'clarifyingQuestion', '')), '');
    result_proposal := case
      when jsonb_typeof(payload -> 'proposal') = 'object' then payload -> 'proposal'
      else null
    end;

    if (result_answer is null and result_clarification is null and result_proposal is null)
      or (result_clarification is not null
          and (result_answer is not null or result_proposal is not null))
      or (result_answer is not null and char_length(result_answer) > 20000)
      or (result_clarification is not null and char_length(result_clarification) > 2000)
    then
      result_valid := false;
      failure_code := 'malformed_output';
    end if;
  end if;

  if result_valid then
    if jsonb_typeof(payload -> 'citedMessageIds') not in ('array', 'null')
      or jsonb_typeof(payload -> 'citedEvidenceIds') not in ('array', 'null')
      or jsonb_typeof(payload -> 'assumptions') not in ('array', 'null')
      or jsonb_typeof(payload -> 'suggestedNextQuestions') not in ('array', 'null')
      or coalesce(jsonb_array_length(payload -> 'citedMessageIds'), 0) > 100
      or coalesce(jsonb_array_length(payload -> 'citedEvidenceIds'), 0) > 100
      or coalesce(jsonb_array_length(payload -> 'assumptions'), 0) > 20
      or coalesce(jsonb_array_length(payload -> 'suggestedNextQuestions'), 0) > 5
    then
      result_valid := false;
      failure_code := 'malformed_output';
    else
      begin
        select coalesce(array_agg(value::uuid), '{}'::uuid[])
        into result_cited_message_ids
        from jsonb_array_elements_text(
          coalesce(payload -> 'citedMessageIds', '[]'::jsonb)
        ) as value;

        select coalesce(array_agg(value::uuid), '{}'::uuid[])
        into result_cited_evidence_ids
        from jsonb_array_elements_text(
          coalesce(payload -> 'citedEvidenceIds', '[]'::jsonb)
        ) as value;
      exception
        when invalid_text_representation then
          result_valid := false;
          failure_code := 'malformed_output';
      end;

      select coalesce(array_agg(value), '{}'::text[])
      into result_assumptions
      from jsonb_array_elements_text(
        coalesce(payload -> 'assumptions', '[]'::jsonb)
      ) as value;

      select coalesce(array_agg(value), '{}'::text[])
      into result_suggestions
      from jsonb_array_elements_text(
        coalesce(payload -> 'suggestedNextQuestions', '[]'::jsonb)
      ) as value;

      if result_valid and (
        exists (
          select 1 from unnest(result_assumptions) as value
          where char_length(btrim(value)) not between 1 and 2000
        )
        or exists (
          select 1 from unnest(result_suggestions) as value
          where char_length(btrim(value)) not between 1 and 2000
        )
      ) then
        result_valid := false;
        failure_code := 'malformed_output';
      end if;
    end if;
  end if;

  -- Citations must be a subset of the frozen manifest: the agent cannot cite
  -- anything this task was not authorized to read.
  if result_valid then
    select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into manifest_message_ids
    from jsonb_array_elements_text(
      coalesce(new.context_manifest_json -> 'messageIds', '[]'::jsonb)
    ) as value;

    select coalesce(array_agg(value::uuid), '{}'::uuid[])
    into manifest_evidence_ids
    from jsonb_array_elements_text(
      coalesce(new.context_manifest_json -> 'evidenceIds', '[]'::jsonb)
    ) as value;

    if not (result_cited_message_ids <@ manifest_message_ids)
      or not (result_cited_evidence_ids <@ manifest_evidence_ids)
    then
      result_valid := false;
      failure_code := 'security_boundary_violated';
    end if;
  end if;

  -- The proposal's own boundaries.
  if result_valid and result_proposal is not null then
    result_target_field := case
      when jsonb_typeof(result_proposal -> 'targetField') = 'string'
        then result_proposal ->> 'targetField'
      else null
    end;

    if result_target_field is null or not (result_proposal ? 'value') then
      result_valid := false;
      failure_code := 'malformed_output';
    elsif not request.can_propose_edit then
      -- Defence in depth. A view-only requester's response schema has no
      -- proposal slot at all, so reaching here means something upstream is
      -- wrong; the result is refused rather than downgraded.
      result_valid := false;
      failure_code := 'security_boundary_violated';
      proposal_failure := 'edit_not_permitted';
    elsif not exists (
      select 1
      from jsonb_array_elements(request.selected_sections) as element(entry)
      where entry ->> 'field' = result_target_field
    ) then
      result_valid := false;
      failure_code := 'security_boundary_violated';
    end if;
  end if;

  if not result_valid then
    update public.prd_assist_requests
    set status = 'failed',
        error_code = failure_code,
        proposal_error_code = proposal_failure,
        settled_at = now(),
        updated_at = now()
    where id = request.id;
    return new;
  end if;

  if result_proposal is not null then
    select entry ->> 'label', entry ->> 'quotedText'
    into result_target_label, result_target_quote
    from jsonb_array_elements(request.selected_sections) as element(entry)
    where entry ->> 'field' = result_target_field;

    -- prd_proposals_one_active_section is the authority on "one active
    -- proposal per section". Catching its violation rather than pre-checking
    -- keeps the race closed: a concurrent settlement cannot slip between a
    -- check and an insert.
    begin
      insert into public.prd_proposals (
        room_id, organization_id, task_id, base_prd_id, base_version,
        section_field, section_label, instruction, quoted_text,
        previous_value, proposed_value, status, created_by, assist_request_id
      ) values (
        request.room_id, request.organization_id, new.id, request.base_prd_id,
        request.base_version, result_target_field, result_target_label,
        request.instruction, result_target_quote,
        coalesce(request.selected_values -> result_target_field, 'null'::jsonb),
        result_proposal -> 'value', 'ready', request.created_by, request.id
      )
      returning id into new_proposal_id;
    exception
      when unique_violation then
        new_proposal_id := null;
        proposal_failure := 'section_has_active_proposal';
    end;
  end if;

  if result_answer is not null or result_clarification is not null then
    agent_body := coalesce(result_answer, result_clarification);

    -- clock_timestamp(), not now(): both rows are written in one transaction,
    -- so now() would give them an identical created_at and the room's
    -- (room_id, created_at, id) ordering would break the tie on a random
    -- uuid -- rendering the reply above the question half the time.
    insert into public.messages (
      room_id, client_id, author_type, author_id, body, created_at, kind,
      prd_assist_request_id, prd_id, prd_version, prd_context
    ) values (
      request.room_id, request.id, 'human', request.created_by,
      request.instruction, clock_timestamp(), 'prd_context',
      request.id, request.base_prd_id, request.base_version,
      request.selected_sections
    )
    on conflict (room_id, client_id) do nothing
    returning id into new_question_message_id;

    insert into public.messages (
      room_id, client_id, author_type, author_id, initiated_by, ai_task_id,
      provider, body, created_at, cited_message_ids, cited_evidence_ids,
      assumptions, suggested_next_questions, kind, prd_assist_request_id,
      prd_id, prd_version, prd_context
    ) values (
      request.room_id, new.id, 'product_agent', null, new.initiating_user_id,
      new.id, new.provider, agent_body, clock_timestamp(),
      result_cited_message_ids, result_cited_evidence_ids, result_assumptions,
      result_suggestions, 'prd_context', request.id, request.base_prd_id,
      request.base_version, request.selected_sections
    )
    on conflict (ai_task_id) do nothing
    returning id into new_answer_message_id;
  end if;

  update public.prd_assist_requests
  set status = 'ready',
      answer = result_answer,
      clarifying_question = result_clarification,
      cited_message_ids = result_cited_message_ids,
      cited_evidence_ids = result_cited_evidence_ids,
      assumptions = result_assumptions,
      suggested_next_questions = result_suggestions,
      proposal_id = new_proposal_id,
      proposal_error_code = proposal_failure,
      question_message_id = new_question_message_id,
      answer_message_id = new_answer_message_id,
      error_code = null,
      settled_at = now(),
      updated_at = now()
  where id = request.id;

  return new;
end;
$$;

create trigger ai_tasks_materialize_prd_assist_outcome
  after update on public.ai_tasks
  for each row execute function public.materialize_prd_assist_outcome();

-- Apply, restated whole.
--
-- Every guarantee 202608080004 made is preserved verbatim: the edit-access
-- check, the ready/has-a-value check, the frozen-base-version staleness
-- check, the lazy versioning (update the live draft in place, cut the next
-- version only past an acceptance point), and the terminal cleanup of older
-- failed proposals for the same section.
--
-- The one addition is the Conversation record: a successful splice posts one
-- compact prd_change message in the same transaction, so an applied change
-- can never exist without it. Discard is untouched and still posts nothing --
-- acceptance, not attempt, is what Conversation records.
create or replace function public.apply_prd_proposal(target_proposal_id uuid)
returns public.prds
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  proposal public.prd_proposals%rowtype;
  current_prd public.prds%rowtype;
  saved_prd public.prds%rowtype;
  next_document jsonb;
begin
  select p.* into proposal
  from public.prd_proposals as p
  where p.id = target_proposal_id
  for update;

  if proposal.id is null or caller_id is null
    or not public.can_edit_room(proposal.room_id)
    or proposal.status <> 'ready'
    or proposal.proposed_value is null
  then
    raise exception 'prd_proposal_not_ready' using errcode = 'P0001';
  end if;

  select p.* into current_prd
  from public.prds as p
  where p.room_id = proposal.room_id
  order by p.version desc, p.id desc
  limit 1
  for update;

  if current_prd.version is distinct from proposal.base_version then
    raise exception 'prd_proposal_conflict' using errcode = 'P0001';
  end if;

  next_document := jsonb_set(
    current_prd.document,
    array[proposal.section_field],
    proposal.proposed_value,
    false
  );

  if current_prd.status = 'draft' then
    update public.prds as p
    set document = next_document,
        updated_at = now()
    where p.id = current_prd.id
    returning * into saved_prd;
  else
    insert into public.prds (
      room_id, organization_id, version, status, document, owner_id, created_by
    )
    values (
      current_prd.room_id, current_prd.organization_id, current_prd.version + 1,
      'draft', next_document, current_prd.owner_id, caller_id
    )
    returning * into saved_prd;
  end if;

  update public.prd_proposals
  set status = 'applied', applied_at = now(), updated_at = now()
  where id = proposal.id;

  update public.prd_proposals
  set status = 'discarded', discarded_at = coalesce(discarded_at, now()),
      updated_at = now()
  where room_id = proposal.room_id
    and section_field = proposal.section_field
    and status = 'failed'
    and created_at <= proposal.created_at
    and id <> proposal.id;

  -- One compact Conversation entry, linked to the proposal and -- when the
  -- proposal came from an assist request -- to that request too. A proposal
  -- from the still-live prd_section_revise path simply has a null request
  -- link. client_id is the proposal id, so a replay cannot double-post.
  insert into public.messages (
    room_id, client_id, author_type, author_id, body, kind,
    prd_assist_request_id, prd_proposal_id, prd_id, prd_version, prd_context
  )
  values (
    proposal.room_id, proposal.id, 'human', caller_id,
    'Applied a Product Agent edit to ' || proposal.section_label || '.',
    'prd_change', proposal.assist_request_id, proposal.id, saved_prd.id,
    saved_prd.version,
    jsonb_build_array(jsonb_build_object(
      'field', proposal.section_field,
      'label', proposal.section_label,
      'quotedText', proposal.quoted_text
    ))
  )
  on conflict (room_id, client_id) do nothing;

  return saved_prd;
end;
$$;

revoke all on function public.apply_prd_proposal(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.apply_prd_proposal(uuid) to authenticated;
