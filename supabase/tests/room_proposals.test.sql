begin;

create extension if not exists pgtap with schema extensions;

select plan(51);

select has_function(
  'public',
  'room_proposed_action_shape_ok',
  array['jsonb']
);
select has_function(
  'public',
  'settlement_room_proposed_action',
  array['jsonb', 'uuid', 'ai_agent_kind', 'jsonb']
);

select ok(
  public.room_proposed_action_shape_ok('{"kind":"prd_generate"}'::jsonb)
  and public.room_proposed_action_shape_ok('{"kind":"prd_revise"}'::jsonb)
  and public.room_proposed_action_shape_ok(
    '{"kind":"user_flow_generate"}'::jsonb
  ),
  'all exact structure proposal objects satisfy the persisted shape'
);
select ok(
  not public.room_proposed_action_shape_ok(
    '{"kind":"user_flow_generate","summary":"cross-kind"}'::jsonb
  )
  and not public.room_proposed_action_shape_ok(
    '{"kind":"decision_capture","summary":"Durable"}'::jsonb
  )
  and not public.room_proposed_action_shape_ok(
    '{"kind":"decision_capture","summary":"Durable","sourceMessageId":"not-a-uuid"}'::jsonb
  )
  and not public.room_proposed_action_shape_ok('{"kind":"task_create"}'::jsonb),
  'cross-kind, missing, invalid-UUID, and unsupported proposals fail closed'
);
select ok(
  not public.room_proposed_action_shape_ok(
    jsonb_build_object(
      'kind', 'decision_capture',
      'summary', repeat('x', 5001),
      'sourceMessageId', null
    )
  ),
  'decision summaries are bounded to 5000 trimmed characters'
);
-- The helper backs a CHECK constraint and a settlement guard, so it has to be
-- total: a scalar, an array, a JSON null, or a SQL NULL must all fail closed
-- rather than raise and strand the settling transaction.
select ok(
  not public.room_proposed_action_shape_ok('"prd_generate"'::jsonb)
  and not public.room_proposed_action_shape_ok(
    '["kind","summary","sourceMessageId"]'::jsonb
  )
  and not public.room_proposed_action_shape_ok('null'::jsonb)
  and not public.room_proposed_action_shape_ok(null),
  'non-object and absent proposals fail closed without raising'
);
-- The summary bound has to trim the same whitespace the shared Zod contract
-- trims. `btrim` strips spaces only, which fails open on a tab/newline-only
-- summary and fails closed on a max-length summary that merely starts with a
-- newline -- a proposal the contract accepts but settlement would discard.
select ok(
  not public.room_proposed_action_shape_ok(
    jsonb_build_object(
      'kind', 'decision_capture',
      'summary', E'\n\t \n',
      'sourceMessageId', null
    )
  ),
  'a summary of nothing but newlines and tabs is not a durable decision'
);
select is(
  public.settlement_room_proposed_action(
    jsonb_build_object(
      'kind', 'decision_capture',
      'summary', E'\n' || repeat('x', 5000) || E'\t',
      'sourceMessageId', null
    ),
    '41000000-0000-4000-8000-000000000001',
    'product',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
  ),
  jsonb_build_object(
    'kind', 'decision_capture',
    'summary', repeat('x', 5000),
    'sourceMessageId', null
  ),
  'a max-length summary wrapped in whitespace is accepted and stored trimmed'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '11000000-0000-4000-8000-000000000001', 'authenticated',
  'authenticated', 'room-proposals@example.com', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.workspaces (id, name, created_by)
values (
  '21000000-0000-4000-8000-000000000001',
  'Room Proposals',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.projects (id, workspace_id, name, created_by)
values (
  '71000000-0000-4000-8000-000000000007',
  '21000000-0000-4000-8000-000000000001',
  'Proposal Project',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values
  (
    '41000000-0000-4000-8000-000000000001',
    '21000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000007',
    'Proposal Room',
    '11000000-0000-4000-8000-000000000001'
  ),
  (
    '41000000-0000-4000-8000-000000000002',
    '21000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000007',
    'Other Room',
    '11000000-0000-4000-8000-000000000001'
  );

insert into public.messages (id, room_id, client_id, author_id, body)
values
  (
    '61000000-0000-4000-8000-000000000001',
    '41000000-0000-4000-8000-000000000001',
    '61100000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001',
    'Recovery codes must be single-use.'
  ),
  (
    '61000000-0000-4000-8000-000000000002',
    '41000000-0000-4000-8000-000000000001',
    '61100000-0000-4000-8000-000000000002',
    '11000000-0000-4000-8000-000000000001',
    'This source is in the Room but not every frozen manifest.'
  ),
  (
    '61000000-0000-4000-8000-000000000003',
    '41000000-0000-4000-8000-000000000002',
    '61100000-0000-4000-8000-000000000003',
    '11000000-0000-4000-8000-000000000001',
    'This source belongs to another Room.'
  );

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values (
  '31000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Proposal Mac', 'macos', repeat('a', 64), 'active'
);

insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json, agent_kind
)
select
  ('72000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  '11000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'codex', 'room_reply', 'running',
  'Reply with proposal fixture ' || value,
  case value
    when 2 then '{"messageIds":["61000000-0000-4000-8000-000000000001"],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    when 4 then '{"messageIds":["61000000-0000-4000-8000-000000000003"],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    else '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
  end,
  case when value = 6 then 'research' else 'product' end::public.ai_agent_kind
from generate_series(1, 8) as value;

insert into public.ai_task_attempts (
  id, task_id, device_id, attempt_no, lease_expires_at
)
select
  ('73000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  ('72000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  '31000000-0000-4000-8000-000000000001',
  1,
  now() + interval '90 seconds'
from generate_series(1, 8) as value;

create temporary table proposal_payloads (
  fixture int primary key,
  action jsonb
);
insert into proposal_payloads (fixture, action)
values
  (1, '{"kind":"user_flow_generate"}'),
  (2, '{"kind":"decision_capture","summary":"Keep recovery codes single-use.","sourceMessageId":"61000000-0000-4000-8000-000000000001"}'),
  (3, '{"kind":"user_flow_generate","summary":"extra"}'),
  (4, '{"kind":"decision_capture","summary":"Wrong Room.","sourceMessageId":"61000000-0000-4000-8000-000000000003"}'),
  (5, '{"kind":"decision_capture","summary":"Not frozen.","sourceMessageId":"61000000-0000-4000-8000-000000000002"}'),
  (6, '{"kind":"decision_capture","summary":"Research cannot propose.","sourceMessageId":null}'),
  (7, '{"kind":"decision_capture","summary":"  No source needed.  ","sourceMessageId":null}'),
  (8, '{"kind":"task_create"}');

select public.settle_ai_task(
  ('72000000-0000-4000-8000-' || lpad(fixture::text, 12, '0'))::uuid,
  '31000000-0000-4000-8000-000000000001',
  ('73000000-0000-4000-8000-' || lpad(fixture::text, 12, '0'))::uuid,
  'complete', null, null,
  jsonb_build_object(
    'kind', 'room_reply',
    'payload', jsonb_build_object(
      'response', 'Proposal fixture ' || fixture,
      'citedMessageIds', '[]'::jsonb,
      'citedEvidenceIds', '[]'::jsonb,
      'assumptions', '[]'::jsonb,
      'suggestedNextQuestions', '[]'::jsonb,
      'proposedAction', action
    ),
    'partial', false
  ),
  false
)
from proposal_payloads
order by fixture;

select is(
  (select proposed_action from public.messages
   where ai_task_id = '72000000-0000-4000-8000-000000000001'),
  '{"kind":"user_flow_generate"}'::jsonb,
  'a valid user-flow proposal persists'
);
select is(
  (select proposed_action from public.messages
   where ai_task_id = '72000000-0000-4000-8000-000000000002'),
  '{"kind":"decision_capture","summary":"Keep recovery codes single-use.","sourceMessageId":"61000000-0000-4000-8000-000000000001"}'::jsonb,
  'a valid decision proposal persists with its frozen same-Room source'
);
select is(
  (select proposed_action from public.messages
   where ai_task_id = '72000000-0000-4000-8000-000000000003'),
  null,
  'an over-specified proposal becomes null without losing the reply'
);
select is(
  (select proposed_action from public.messages
   where ai_task_id = '72000000-0000-4000-8000-000000000004'),
  null,
  'a frozen source from another Room is rejected'
);
select is(
  (select proposed_action from public.messages
   where ai_task_id = '72000000-0000-4000-8000-000000000005'),
  null,
  'a same-Room source outside the frozen manifest is rejected'
);
select is(
  (select proposed_action from public.messages
   where ai_task_id = '72000000-0000-4000-8000-000000000006'),
  null,
  'a Research Agent reply cannot carry a durable proposal'
);
-- Asserted on the settlement helper directly: the research-message trigger also
-- clears proposed_action, so the persisted row alone cannot tell whether the
-- agent-kind guard is doing its job.
select is(
  public.settlement_room_proposed_action(
    '{"kind":"user_flow_generate"}'::jsonb,
    '41000000-0000-4000-8000-000000000001',
    'research',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
  ),
  null,
  'settlement refuses a proposal from any agent other than the Product Agent'
);
select is(
  (select author_type::text from public.messages
   where ai_task_id = '72000000-0000-4000-8000-000000000006'),
  'research_agent',
  'the Research Agent reply still materializes with its correct authorship'
);
select is(
  (select proposed_action from public.messages
   where ai_task_id = '72000000-0000-4000-8000-000000000007'),
  '{"kind":"decision_capture","summary":"No source needed.","sourceMessageId":null}'::jsonb,
  'a source-free decision persists with an explicit null and trimmed summary'
);
select is(
  (select proposed_action from public.messages
   where ai_task_id = '72000000-0000-4000-8000-000000000008'),
  null,
  'task_create is never persisted'
);
select is(
  (select count(*)::int from public.messages
   where ai_task_id is not null
     and room_id = '41000000-0000-4000-8000-000000000001'),
  8,
  'invalid proposal payloads do not discard otherwise-valid replies'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_id, body, proposed_action
    )
    values (
      '41000000-0000-4000-8000-000000000001',
      '61100000-0000-4000-8000-000000000004',
      '11000000-0000-4000-8000-000000000001',
      'A forged human proposal.',
      '{"kind":"user_flow_generate"}'::jsonb
    )
  $$,
  '23514', null,
  'a human message cannot carry any proposed action'
);

reset role;

select throws_ok(
  $$
    update public.messages
    set proposed_action =
      '{"kind":"decision_capture","summary":"extra","sourceMessageId":null,"approved":true}'::jsonb
    where ai_task_id = '72000000-0000-4000-8000-000000000002'
  $$,
  '23514', null,
  'the table check rejects invalid cross-kind or extra proposal fields'
);

-- Responding to a proposal: durable per-user dismissal and acceptance that
-- creates the artifact exactly once no matter how many participants confirm.

select has_function('public', 'dismiss_message_proposal', array['uuid']);
select has_function('public', 'capture_proposed_decision', array['uuid']);
select has_function('public', 'accept_proposed_user_flow', array['uuid']);

-- The agent replies were inserted by settlement, so their ids are only known
-- now. Name them by fixture so every assertion below reads as its proposal.
create temporary table proposal_messages as
select
  payload.fixture,
  message.id as message_id
from proposal_payloads as payload
join public.messages as message
  on message.ai_task_id =
    ('72000000-0000-4000-8000-' || lpad(payload.fixture::text, 12, '0'))::uuid;

grant select on proposal_messages to authenticated;

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '11000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'room-proposals-viewer@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '11000000-0000-4000-8000-000000000003', 'authenticated',
    'authenticated', 'room-proposals-outsider@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

-- The outsider is a Workspace member with no Room participation: Workspace
-- membership must not confer the right to respond to a Room's proposals.
insert into public.memberships (workspace_id, user_id, role)
values
  (
    '21000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000002',
    'member'
  ),
  (
    '21000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000003',
    'member'
  );

insert into public.room_participants (room_id, user_id, access, added_by)
values (
  '41000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000002',
  'view',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values (
  '11000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'codex'
);

insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values (
  '11000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'codex', 'installed', 'authenticated', 'supported'
);

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000002',
  true
);

select is(
  public.dismiss_message_proposal(
    (select message_id from proposal_messages where fixture = 1)
  ),
  'dismissed'::public.proposal_response,
  'a participant dismisses a proposal for themselves'
);

do $$
begin
  perform public.dismiss_message_proposal(
    (select message_id from proposal_messages where fixture = 1)
  );
end;
$$;

select results_eq(
  $$
    select response.user_id, response.response::text
    from public.message_proposal_responses as response
    where response.message_id =
      (select message_id from proposal_messages where fixture = 1)
  $$,
  $$ values ('11000000-0000-4000-8000-000000000002'::uuid, 'dismissed') $$,
  'a repeated dismissal stays one response and binds to the dismissing user'
);

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000003',
  true
);

select throws_ok(
  $$
    select public.dismiss_message_proposal(
      (select message_id from proposal_messages where fixture = 1)
    )
  $$,
  'P0001', 'Room participation required',
  'a Workspace member outside the Room cannot respond to its proposals'
);

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000001',
  true
);

select is(
  (select response
   from public.message_proposal_responses
   where message_id =
     (select message_id from proposal_messages where fixture = 1)
     and user_id = '11000000-0000-4000-8000-000000000001'),
  null,
  'another participant dismissal leaves the proposal open for everyone else'
);

select throws_ok(
  $$
    select public.dismiss_message_proposal(
      '61000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001', 'Proposal not found',
  'a message carrying no proposal has nothing to dismiss'
);

create temporary table captured_decision as
select public.capture_proposed_decision(
  (select message_id from proposal_messages where fixture = 2)
) as decision;

select is(
  (select (decision).summary from captured_decision),
  'Keep recovery codes single-use.',
  'the captured Decision is exactly the summary the contract described'
);
select is(
  (select (decision).source_message_id from captured_decision),
  '61000000-0000-4000-8000-000000000001'::uuid,
  'the captured Decision keeps the proposal source message'
);
select is(
  (select (decision).proposal_message_id from captured_decision),
  (select message_id from proposal_messages where fixture = 2),
  'the captured Decision records the proposal that produced it'
);
select is(
  (select (decision).created_by from captured_decision),
  '11000000-0000-4000-8000-000000000001'::uuid,
  'the confirming participant authors the Decision'
);
select is(
  (select response
   from public.message_proposal_responses
   where message_id =
     (select message_id from proposal_messages where fixture = 2)
     and user_id = '11000000-0000-4000-8000-000000000001'),
  'accepted'::public.proposal_response,
  'capturing a Decision records the acceptance'
);

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000002',
  true
);

select is(
  (select (public.capture_proposed_decision(
     (select message_id from proposal_messages where fixture = 2)
   )).id),
  (select (decision).id from captured_decision),
  'a second confirmation returns the Decision the first one created'
);
select is(
  (select count(*)::int from public.decisions
   where proposal_message_id =
     (select message_id from proposal_messages where fixture = 2)),
  1,
  'two participants confirming one proposal produce one Decision'
);
select is(
  (select response
   from public.message_proposal_responses
   where message_id =
     (select message_id from proposal_messages where fixture = 2)
     and user_id = '11000000-0000-4000-8000-000000000002'),
  'accepted'::public.proposal_response,
  'the second confirmation is still recorded for its own user'
);

select throws_ok(
  $$
    select public.capture_proposed_decision(
      (select message_id from proposal_messages where fixture = 1)
    )
  $$,
  'P0001', 'Decision proposal required',
  'a user flow proposal cannot be captured as a Decision'
);
select throws_ok(
  $$
    select public.accept_proposed_user_flow(
      (select message_id from proposal_messages where fixture = 2)
    )
  $$,
  'P0001', 'User flow proposal required',
  'a Decision proposal cannot start user flow generation'
);
select throws_ok(
  $$
    select public.accept_proposed_user_flow(
      (select message_id from proposal_messages where fixture = 1)
    )
  $$,
  'P0001', 'User flow edit access required',
  'a view-only participant cannot accept user flow generation'
);

select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000001',
  true
);

create temporary table accepted_user_flow as
select public.accept_proposed_user_flow(
  (select message_id from proposal_messages where fixture = 1)
) as result;

select is(
  (select result -> 'user_flow' ->> 'room_id' from accepted_user_flow),
  '41000000-0000-4000-8000-000000000001',
  'accepting returns the Room user flow it started'
);
select is(
  (select result -> 'task' ->> 'kind' from accepted_user_flow),
  'user_flow_generate',
  'accepting returns the queued generation task'
);
select is(
  (select count(*)::int from public.user_flows
   where room_id = '41000000-0000-4000-8000-000000000001'),
  1,
  'accepting starts exactly one user flow for the Room'
);
select is(
  (select count(*)::int from public.ai_tasks
   where kind = 'user_flow_generate'
     and source_message_id =
       (select message_id from proposal_messages where fixture = 1)),
  1,
  'accepting queues exactly one generation task for the proposal'
);
select is(
  (select response
   from public.message_proposal_responses
   where message_id =
     (select message_id from proposal_messages where fixture = 1)
     and user_id = '11000000-0000-4000-8000-000000000001'),
  'accepted'::public.proposal_response,
  'accepting user flow generation records the acceptance'
);

-- A terminal task is the retry case that matters: the acceptance is settled, so
-- a second click must resurface that task rather than queue another run.
update public.ai_tasks
set status = 'failed'
where kind = 'user_flow_generate'
  and source_message_id =
    (select message_id from proposal_messages where fixture = 1);

select is(
  (select public.accept_proposed_user_flow(
     (select message_id from proposal_messages where fixture = 1)
   ) -> 'task' ->> 'id'),
  (select result -> 'task' ->> 'id' from accepted_user_flow),
  'a retry returns the existing task even after it reached a terminal state'
);
select is(
  (select count(*)::int from public.ai_tasks
   where kind = 'user_flow_generate'
     and room_id = '41000000-0000-4000-8000-000000000001'),
  1,
  'a retry queues no second generation task'
);
select is(
  (select count(*)::int from public.user_flows
   where room_id = '41000000-0000-4000-8000-000000000001'),
  1,
  'a retry leaves the single started user flow untouched'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000002',
  true
);

select results_eq(
  $$
    select response.message_id, response.response::text
    from public.message_proposal_responses as response
    order by response.response::text
  $$,
  $$
    select proposal.message_id, expected.response
    from (values (2, 'accepted'), (1, 'dismissed')) as expected(fixture, response)
    join proposal_messages as proposal on proposal.fixture = expected.fixture
    order by expected.response
  $$,
  'a participant reads their own responses and no one else''s'
);

-- Decisions are still written directly by participants, so the proposal link
-- has to be bound to the Room in storage rather than by the capture function.
select throws_ok(
  $$
    insert into public.decisions (
      room_id, summary, created_by, proposal_message_id
    )
    values (
      '41000000-0000-4000-8000-000000000001',
      'A proposal from a Room this Decision does not belong to.',
      '11000000-0000-4000-8000-000000000002',
      '61000000-0000-4000-8000-000000000003'
    )
  $$,
  '23503', null,
  'a Decision cannot claim a proposal from another Room'
);

select throws_ok(
  $$
    insert into public.message_proposal_responses (
      message_id, user_id, response
    )
    values (
      (select message_id from proposal_messages where fixture = 1),
      '11000000-0000-4000-8000-000000000002',
      'accepted'
    )
  $$,
  '42501', null,
  'responses are written only by the response functions'
);

reset role;

select * from finish();
rollback;
