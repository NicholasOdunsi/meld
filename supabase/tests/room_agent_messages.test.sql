begin;

create extension if not exists pgtap with schema extensions;

select plan(49);

-- Users: u1 owns room A and its messages, u2 owns room B, u3 is an org member
-- with access to neither room (the revoked/non-participant case).
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'room-owner@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'other-owner@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000003', 'authenticated',
    'authenticated', 'outsider@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.organizations (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000001',
  'Agent Replies',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.memberships (organization_id, user_id, role)
values
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'member'
  ),
  (
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    'member'
  );

insert into public.discovery_rooms (id, organization_id, name, owner_id)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Room A',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Room B',
    '10000000-0000-4000-8000-000000000002'
  );

insert into public.messages (id, room_id, client_id, author_id, body)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '@Product Agent summarize this room.'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'A second human message in room A.'
  ),
  (
    '50000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    'A human message in room B.'
  );

insert into public.evidence (id, room_id, title, note, created_by)
values (
  '53000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  'Room A evidence',
  'An observation in room A',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Owner Mac',
  'macos',
  repeat('1', 64),
  'active'
);

insert into public.provider_connections (
  user_id, device_id, provider, installation, version,
  authentication, compatibility, last_seen_at
)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'codex', 'installed', '1.0.0', 'authenticated', 'supported', now()
);

insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'codex'
);

-- Running room-reply tasks for settlement, plus two plain tasks for the direct
-- provenance and RLS inserts. Settlement tasks leave source_message_id null so
-- they do not collide with the create_room_reply_task tests on the same source.
insert into public.ai_tasks (
  id, initiating_user_id, organization_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json,
  source_message_id
)
values
  (
    '70000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Complete room reply',
    '{"messageIds":["50000000-0000-4000-8000-000000000001","50000000-0000-4000-8000-000000000002"],"attachmentIds":[],"evidenceIds":["53000000-0000-4000-8000-000000000001"],"decisionIds":[]}',
    null
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Partial room reply',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    null
  ),
  (
    '70000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Malformed room reply',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    null
  ),
  (
    '70000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Out of manifest room reply',
    '{"messageIds":["50000000-0000-4000-8000-000000000002"],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    null
  ),
  (
    '70000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Failing room reply',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    null
  ),
  (
    '70000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'completed', 'Provenance fixture task',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    null
  ),
  (
    '70000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'completed', 'RLS fixture task',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    null
  );

insert into public.ai_task_attempts (
  id, task_id, device_id, attempt_no, lease_expires_at
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '90 seconds'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '90 seconds'
  ),
  (
    '71000000-0000-4000-8000-000000000003',
    '70000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '90 seconds'
  ),
  (
    '71000000-0000-4000-8000-000000000004',
    '70000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '90 seconds'
  ),
  (
    '71000000-0000-4000-8000-000000000005',
    '70000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '90 seconds'
  );

-- Structure --------------------------------------------------------------

-- The four-argument schema-qualified form is load-bearing here for the same
-- reason has_table needs its ::name casts: has_column's three-name overload is
-- (table, column, description), not (schema, table, column), so a description
-- argument is required to reach the schema-qualified overload.
select has_column(
  'public'::name, 'ai_tasks'::name, 'source_message_id'::name,
  'ai_tasks.source_message_id exists'::text
);
select has_column(
  'public'::name, 'messages'::name, 'author_type'::name,
  'messages.author_type exists'::text
);
select has_column(
  'public'::name, 'messages'::name, 'ai_task_id'::name,
  'messages.ai_task_id exists'::text
);
select has_function(
  'public',
  'create_room_reply_task',
  array['uuid', 'ai_provider']
);
select has_function(
  'public',
  'list_room_ai_task_statuses',
  array['uuid']
);
select has_index(
  'public'::name,
  'ai_tasks'::name,
  'ai_tasks_one_room_reply_per_source'::name
);

-- Message provenance shapes ----------------------------------------------

select throws_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_type, author_id, body
    )
    values (
      '40000000-0000-4000-8000-000000000001',
      '5a000000-0000-4000-8000-000000000001',
      'human', null, 'A human message needs an author.'
    )
  $$,
  '23514', null,
  'a human message without an author is rejected'
);

select throws_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_type, author_id, ai_task_id, body
    )
    values (
      '40000000-0000-4000-8000-000000000001',
      '5a000000-0000-4000-8000-000000000002',
      'human',
      '10000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000010',
      'A human message cannot carry AI provenance.'
    )
  $$,
  '23514', null,
  'a human message with AI provenance is rejected'
);

select throws_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_type, author_id,
      ai_task_id, provider, body
    )
    values (
      '40000000-0000-4000-8000-000000000001',
      '5a000000-0000-4000-8000-000000000003',
      'product_agent', null,
      '70000000-0000-4000-8000-000000000010', 'codex',
      'A Product Agent message needs an initiator.'
    )
  $$,
  '23514', null,
  'a Product Agent message without an initiator is rejected'
);

select throws_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_type, author_id,
      initiated_by, ai_task_id, body
    )
    values (
      '40000000-0000-4000-8000-000000000001',
      '5a000000-0000-4000-8000-000000000004',
      'product_agent', null,
      '10000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000010',
      'A Product Agent message needs a provider.'
    )
  $$,
  '23514', null,
  'a Product Agent message without a provider is rejected'
);

select throws_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_type, author_id,
      initiated_by, provider, body
    )
    values (
      '40000000-0000-4000-8000-000000000001',
      '5a000000-0000-4000-8000-000000000005',
      'product_agent', null,
      '10000000-0000-4000-8000-000000000001', 'codex',
      'A Product Agent message needs a task.'
    )
  $$,
  '23514', null,
  'a Product Agent message without an AI task is rejected'
);

select lives_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_type, author_id,
      initiated_by, ai_task_id, provider, body,
      cited_message_ids, cited_evidence_ids,
      assumptions, suggested_next_questions
    )
    values (
      '40000000-0000-4000-8000-000000000001',
      '5a000000-0000-4000-8000-000000000006',
      'product_agent', null,
      '10000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000010', 'codex',
      'A well-formed Product Agent reply.',
      array['50000000-0000-4000-8000-000000000001']::uuid[],
      array['53000000-0000-4000-8000-000000000001']::uuid[],
      array['Assumes a weekly release cadence'],
      array['What is the target launch date?']
    )
  $$,
  'a well-formed Product Agent message is accepted'
);

select ok(
  (
    select assumptions = array['Assumes a weekly release cadence']
      and suggested_next_questions = array['What is the target launch date?']
      and cited_message_ids = array['50000000-0000-4000-8000-000000000001']::uuid[]
      and cited_evidence_ids = array['53000000-0000-4000-8000-000000000001']::uuid[]
    from public.messages
    where client_id = '5a000000-0000-4000-8000-000000000006'
  ),
  'Product Agent assumptions and suggested questions persist on the message'
);

select throws_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_type, author_id,
      initiated_by, ai_task_id, provider, body, assumptions
    )
    values (
      '40000000-0000-4000-8000-000000000001',
      '5a000000-0000-4000-8000-000000000007',
      'product_agent', null,
      '10000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000011', 'codex',
      'Too many assumptions.',
      (select array_agg('assumption ' || value) from generate_series(1, 21) as value)
    )
  $$,
  '23514', null,
  'more than twenty assumptions are rejected'
);

select throws_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_type, author_id,
      initiated_by, ai_task_id, provider, body, suggested_next_questions
    )
    values (
      '40000000-0000-4000-8000-000000000001',
      '5a000000-0000-4000-8000-000000000008',
      'product_agent', null,
      '10000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000011', 'codex',
      'Too many questions.',
      (select array_agg('question ' || value) from generate_series(1, 6) as value)
    )
  $$,
  '23514', null,
  'more than five suggested questions are rejected'
);

select throws_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_type, author_id,
      initiated_by, ai_task_id, provider, body, assumptions
    )
    values (
      '40000000-0000-4000-8000-000000000001',
      '5a000000-0000-4000-8000-000000000009',
      'product_agent', null,
      '10000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000011', 'codex',
      'An overlong assumption.',
      array[repeat('x', 2001)]
    )
  $$,
  '23514', null,
  'an assumption longer than 2,000 characters is rejected'
);

-- create_room_reply_task -------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$
    select public.create_room_reply_task(
      '50000000-0000-4000-8000-000000000001'
    )
  $$,
  'an owner can create a room-reply task bound to their message'
);

select ok(
  (
    select created ->> 'sourceMessageId'
        = '50000000-0000-4000-8000-000000000001'
      and created ->> 'kind' = 'room_reply'
      and created ->> 'provider' = 'codex'
      and created ->> 'status' = 'queued'
    from (
      select public.create_room_reply_task(
        '50000000-0000-4000-8000-000000000001'
      ) as created
    ) as creation
  ),
  'the created task binds the source message and resolves the saved default'
);

select is(
  (
    select count(*)::integer
    from public.ai_tasks
    where source_message_id = '50000000-0000-4000-8000-000000000001'
      and kind = 'room_reply'
  ),
  1,
  'one source message creates at most one room-reply task'
);

select is(
  (
    select public.create_room_reply_task(
      '50000000-0000-4000-8000-000000000001'
    ) ->> 'id'
  ),
  (
    select id::text from public.ai_tasks
    where source_message_id = '50000000-0000-4000-8000-000000000001'
      and kind = 'room_reply'
  ),
  'a repeated request for the same source message returns the existing task'
);

select is(
  (
    select count(*)::integer
    from public.ai_tasks
    where source_message_id = '50000000-0000-4000-8000-000000000001'
      and kind = 'room_reply'
  ),
  1,
  'the repeated request did not queue a second task'
);

select throws_ok(
  $$
    select public.create_room_reply_task(
      '50000000-0000-4000-8000-000000000003'
    )
  $$,
  'P0001', null,
  'a message the caller does not own is rejected'
);

select throws_ok(
  $$
    select public.create_room_reply_task(
      '50000000-0000-4000-8000-0000000000ff'
    )
  $$,
  'P0001', null,
  'an unknown source message is rejected'
);

select lives_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'prd_generate', 'Draft a PRD',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  'ordinary task creation still works for later task kinds'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'An unbound room reply',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  'P0001', 'room_reply_requires_source_message',
  'create_ai_task refuses room_reply so a mention must bind its source message'
);

select lives_ok(
  $$
    insert into public.messages (room_id, client_id, body)
    values (
      '40000000-0000-4000-8000-000000000001',
      '5b000000-0000-4000-8000-000000000001',
      'A human still posts through the message policy.'
    )
  $$,
  'a human participant can still post an ordinary message'
);

select throws_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_type, author_id,
      initiated_by, ai_task_id, provider, body
    )
    values (
      '40000000-0000-4000-8000-000000000001',
      '5b000000-0000-4000-8000-000000000002',
      'product_agent', null,
      '10000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000011', 'codex',
      'An authenticated client must not forge an agent message.'
    )
  $$,
  '42501', null,
  'authenticated users cannot directly insert Product Agent messages'
);

reset role;

select throws_ok(
  $$
    insert into public.ai_tasks (
      initiating_user_id, organization_id, room_id, device_id,
      provider, kind, status, instruction, context_manifest_json,
      source_message_id
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'queued', 'Duplicate source binding',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
      '50000000-0000-4000-8000-000000000001'
    )
  $$,
  '23505', null,
  'a second room-reply task for one source message is refused by the index'
);

-- Settlement inserts exactly one Product Agent message -------------------

select is(
  public.settle_ai_task(
    '70000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'complete', null, null,
    '{"kind":"room_reply","payload":{"response":"Here is the summary.","citedMessageIds":["50000000-0000-4000-8000-000000000001"],"citedEvidenceIds":["53000000-0000-4000-8000-000000000001"],"assumptions":["Assumes a weekly cadence"],"suggestedNextQuestions":["When do we launch?"]},"partial":false}'::jsonb,
    false
  ),
  'completed'::public.ai_task_status,
  'a valid completed room reply settles to completed'
);

select is(
  (
    select count(*)::integer from public.messages
    where ai_task_id = '70000000-0000-4000-8000-000000000001'
  ),
  1,
  'a valid completed room reply inserts one Product Agent message'
);

select ok(
  (
    select author_type = 'product_agent'
      and author_id is null
      and initiated_by = '10000000-0000-4000-8000-000000000001'
      and provider = 'codex'
      and room_id = '40000000-0000-4000-8000-000000000001'
      and body = 'Here is the summary.'
    from public.messages
    where ai_task_id = '70000000-0000-4000-8000-000000000001'
  ),
  'the inserted message carries the settled task provenance'
);

select ok(
  (
    select cited_message_ids = array['50000000-0000-4000-8000-000000000001']::uuid[]
      and cited_evidence_ids = array['53000000-0000-4000-8000-000000000001']::uuid[]
      and assumptions = array['Assumes a weekly cadence']
      and suggested_next_questions = array['When do we launch?']
    from public.messages
    where ai_task_id = '70000000-0000-4000-8000-000000000001'
  ),
  'the validated citations, assumptions and questions persist'
);

select is(
  public.settle_ai_task(
    '70000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001',
    'complete', null, null,
    '{"kind":"room_reply","payload":{"response":"Here is the summary.","citedMessageIds":["50000000-0000-4000-8000-000000000001"],"citedEvidenceIds":["53000000-0000-4000-8000-000000000001"],"assumptions":["Assumes a weekly cadence"],"suggestedNextQuestions":["When do we launch?"]},"partial":false}'::jsonb,
    false
  ),
  'completed'::public.ai_task_status,
  'a duplicate identical completion returns the terminal status'
);

select is(
  (
    select count(*)::integer from public.messages
    where ai_task_id = '70000000-0000-4000-8000-000000000001'
  ),
  1,
  'the duplicate completion did not insert a second message'
);

select throws_ok(
  $$
    select public.settle_ai_task(
      '70000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000001',
      'complete', null, null,
      '{"kind":"room_reply","payload":{"response":"A different answer.","citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[]},"partial":false}'::jsonb,
      false
    )
  $$,
  'P0001', 'conflicting_ai_task_settlement',
  'a conflicting completion is rejected'
);

select is(
  public.settle_ai_task(
    '70000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000002',
    'complete', null, null,
    '{"kind":"room_reply","payload":{"response":"Partial draft.","citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[]},"partial":true}'::jsonb,
    true
  ),
  'needs_review'::public.ai_task_status,
  'a partial room reply settles terminally to needs_review without raising'
);

select is(
  (
    select count(*)::integer from public.messages
    where ai_task_id = '70000000-0000-4000-8000-000000000002'
  ),
  0,
  'a partial result inserts no Product Agent message'
);

select is(
  public.settle_ai_task(
    '70000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000003',
    'complete', null, null,
    '{"kind":"room_reply","payload":{"citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[]},"partial":false}'::jsonb,
    false
  ),
  'needs_review'::public.ai_task_status,
  'a malformed completion with no response settles terminally to needs_review'
);

select is(
  (
    select count(*)::integer from public.messages
    where ai_task_id = '70000000-0000-4000-8000-000000000003'
  ),
  0,
  'a malformed completion inserts no Product Agent message'
);

select is(
  public.settle_ai_task(
    '70000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000003',
    'complete', null, null,
    '{"kind":"room_reply","payload":{"citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[]},"partial":false}'::jsonb,
    false
  ),
  'needs_review'::public.ai_task_status,
  'replaying the same malformed completion is idempotent'
);

select is(
  (
    select count(*)::integer from public.messages
    where ai_task_id = '70000000-0000-4000-8000-000000000003'
  ),
  0,
  'the malformed replay still inserts no Product Agent message'
);

select throws_ok(
  $$
    select public.settle_ai_task(
      '70000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000003',
      'complete', null, null,
      '{"kind":"room_reply","payload":{"response":"Now a valid reply.","citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[]},"partial":false}'::jsonb,
      false
    )
  $$,
  'P0001', 'conflicting_ai_task_settlement',
  'a conflicting later settlement of a malformed reply is still rejected'
);

select is(
  public.settle_ai_task(
    '70000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000004',
    'complete', null, null,
    '{"kind":"room_reply","payload":{"response":"Cites an unauthorized message.","citedMessageIds":["50000000-0000-4000-8000-000000000001"],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[]},"partial":false}'::jsonb,
    false
  ),
  'needs_review'::public.ai_task_status,
  'a citation outside the frozen manifest settles terminally to needs_review'
);

select is(
  (
    select count(*)::integer from public.messages
    where ai_task_id = '70000000-0000-4000-8000-000000000004'
  ),
  0,
  'an out-of-manifest citation inserts no Product Agent message'
);

select is(
  public.settle_ai_task(
    '70000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000005',
    'fail', 'unknown', 'The model failed.', null, false
  ),
  'failed'::public.ai_task_status,
  'a failed room reply settles without completing'
);

select is(
  (
    select count(*)::integer from public.messages
    where ai_task_id = '70000000-0000-4000-8000-000000000005'
  ),
  0,
  'a failed room reply inserts no Product Agent message'
);

-- Safe status projection -------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select ok(
  exists (
    select 1
    from public.list_room_ai_task_statuses(
      '40000000-0000-4000-8000-000000000001'
    )
    where task_id = '70000000-0000-4000-8000-000000000001'
      and status = 'completed'
      and provider = 'codex'
  ),
  'a room participant can read safe task status'
);

select is(
  (
    select count(*)::integer
    from public.list_room_ai_task_statuses(
      '40000000-0000-4000-8000-000000000001'
    )
  ),
  (
    select count(*)::integer
    from public.ai_tasks
    where room_id = '40000000-0000-4000-8000-000000000001'
  ),
  'the projection lists every room task through its safe columns only'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);

select is(
  (
    select count(*)::integer
    from public.list_room_ai_task_statuses(
      '40000000-0000-4000-8000-000000000001'
    )
  ),
  0,
  'a non-participant sees no room task status'
);

reset role;

select * from finish();
rollback;
