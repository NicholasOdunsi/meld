begin;

create extension if not exists pgtap with schema extensions;

select plan(65);

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
  )
  and public.room_proposed_action_shape_ok(
    '{"kind":"user_flow_revise"}'::jsonb
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

-- Fixture 1 is an update proposal, so the Room already has the lifecycle row
-- that distinguishes a revision from creation of its first flow.
insert into public.user_flows (room_id, created_by)
values (
  '41000000-0000-4000-8000-000000000001',
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
  case when value = 1 then 'claude' else 'codex' end::public.ai_provider,
  'room_reply', 'running',
  case when value = 1
    then 'Update the existing user flow terminology.'
    else 'Reply with proposal fixture ' || value
  end,
  case value
    when 2 then '{"messageIds":["61000000-0000-4000-8000-000000000001"],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    when 4 then '{"messageIds":["61000000-0000-4000-8000-000000000003"],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    else '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
  end,
  case when value = 6 then 'research' else 'product' end::public.ai_agent_kind
from generate_series(1, 8) as value;

update public.ai_tasks
set model = 'claude-sonnet-4-5'
where id = '72000000-0000-4000-8000-000000000001';

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
  -- Legacy connectors only knew generate. The message trigger reads the clear
  -- update intent from the task and persists this as user_flow_revise.
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
  '{"kind":"user_flow_revise"}'::jsonb,
  'a valid user-flow revision proposal persists'
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
), (
  '11000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'claude', 'installed', 'authenticated', 'supported'
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

-- All three response functions are security definer and so bypass RLS
-- entirely: their in-function participation check is the only barrier between
-- a Workspace member and another Room's artifacts. Cover every one of them, or
-- deleting a guard leaves the suite green.
select throws_ok(
  $$
    select public.capture_proposed_decision(
      (select message_id from proposal_messages where fixture = 2)
    )
  $$,
  'P0001', 'Room participation required',
  'a Workspace member outside the Room cannot capture its Decisions'
);
select throws_ok(
  $$
    select public.accept_proposed_user_flow(
      (select message_id from proposal_messages where fixture = 1)
    )
  $$,
  'P0001', 'Room participation required',
  'a Workspace member outside the Room cannot start its user flow'
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
  (select result -> 'task' ->> 'provider' from accepted_user_flow),
  'claude',
  'the accepted update inherits the proposal provider'
);
select is(
  (select result -> 'task' ->> 'model' from accepted_user_flow),
  'claude-sonnet-4-5',
  'the accepted update inherits the proposal model'
);
select is(
  (select task.instruction
   from public.ai_tasks as task
   where task.id = (select (result -> 'task' ->> 'id')::uuid from accepted_user_flow)),
  'Update the existing user flow terminology.',
  'the accepted update carries the original request into generation'
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

update public.ai_tasks
set status = 'completed',
    result_json = jsonb_build_object(
      'kind', 'user_flow_generate',
      'payload', jsonb_build_object(
        'title', 'Updated flow',
        'summary', 'Updated terminology.',
        'nodes', jsonb_build_array(
          jsonb_build_object('id', 'start', 'kind', 'start', 'label', 'Start', 'detail', null),
          jsonb_build_object('id', 'end', 'kind', 'end', 'label', 'End', 'detail', null)
        ),
        'edges', jsonb_build_array(
          jsonb_build_object('id', 'e1', 'from', 'start', 'to', 'end', 'label', null)
        ),
        'openQuestions', '[]'::jsonb
      ),
      'partial', false
    )
where id = (select (result -> 'task' ->> 'id')::uuid from accepted_user_flow);

select is(
  (select generation.application_mode
   from public.user_flow_generations as generation
   where generation.task_id =
     (select (result -> 'task' ->> 'id')::uuid from accepted_user_flow)),
  'replace',
  'a user-flow revision materializes as a canvas replacement'
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

-- Asserted as the table owner, with the policy below out of the way: the
-- capture function is security definer and bypasses that policy too, so the
-- composite foreign key is the only thing keeping a proposal link inside the
-- Room its Decision belongs to.
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

-- A participant may still write their own Decisions directly, but never one
-- that claims a proposal: otherwise a forged summary could take the proposal's
-- unique key and be handed back to everyone who later confirms it.
select throws_ok(
  $$
    insert into public.decisions (
      room_id, summary, created_by, proposal_message_id
    )
    values (
      '41000000-0000-4000-8000-000000000001',
      'We agreed to ship without a security review.',
      '11000000-0000-4000-8000-000000000002',
      (select message_id from proposal_messages where fixture = 7)
    )
  $$,
  '42501', null,
  'a participant cannot claim an unanswered proposal in their own Room'
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

-- The captured Decision's own author cannot reopen the same hole from the
-- other side by rewriting it, or by releasing the proposal's unique key for
-- someone else to claim.
select set_config(
  'request.jwt.claim.sub',
  '11000000-0000-4000-8000-000000000001',
  true
);

update public.decisions
set summary = 'We agreed to ship without a security review.',
    proposal_message_id = null
where proposal_message_id =
  (select message_id from proposal_messages where fixture = 2);

select results_eq(
  $$
    select decision.summary, decision.proposal_message_id
    from public.decisions as decision
    where decision.room_id = '41000000-0000-4000-8000-000000000001'
  $$,
  $$
    select 'Keep recovery codes single-use.', proposal.message_id
    from proposal_messages as proposal
    where proposal.fixture = 2
  $$,
  'a captured Decision is not editable outside the capture function'
);

-- Deleting it releases the proposal's unique key exactly as nulling the link
-- would, and takes the Room-wide artifact every other participant's `accepted`
-- response points at with it. The DELETE policy has to carry the same
-- restriction the INSERT and UPDATE policies do.
delete from public.decisions
where proposal_message_id =
  (select message_id from proposal_messages where fixture = 2);

select is(
  (select count(*)::int
   from public.decisions
   where proposal_message_id =
     (select message_id from proposal_messages where fixture = 2)),
  1,
  'a captured Decision is not deletable by the participant who confirmed it'
);

reset role;

-- Everything above proves single-session idempotency: the calls run back to
-- back in one transaction, so the proposal row lock never actually blocks. Two
-- participants confirming the same proposal at the same instant is a different
-- claim, and the only way to make it is with a second session. The fixtures
-- above are uncommitted and therefore invisible to one, so this scenario
-- builds, uses, and removes its own committed fixtures.
create temporary table concurrent_capture (
  available boolean not null,
  first_decision_id uuid,
  second_decision_id uuid,
  decision_count int,
  accepted_count int,
  summary text
);

do $concurrent$
declare
  -- A namespace of its own: these rows are committed, so they must not collide
  -- with any other test file's fixtures, and they are removed again below.
  fixture_room constant text := 'aa000000-0000-4000-8000-000000000001';
  fixture_workspace constant text := 'aa000000-0000-4000-8000-000000000002';
  fixture_user_a constant text := 'aa000000-0000-4000-8000-000000000003';
  fixture_user_b constant text := 'aa000000-0000-4000-8000-000000000004';
  fixture_project constant text := 'aa000000-0000-4000-8000-000000000005';
  fixture_device constant text := 'aa000000-0000-4000-8000-000000000006';
  fixture_task constant text := 'aa000000-0000-4000-8000-000000000007';
  fixture_message constant text := 'aa000000-0000-4000-8000-000000000008';
  fixture_client constant text := 'aa000000-0000-4000-8000-000000000009';
  capture_call constant text := format(
    'select (public.capture_proposed_decision(%L)).id::text', fixture_message
  );
  cleanup_sql text;
  connection_string text;
  first_id uuid;
  second_id uuid;
  captured_count int;
  accepted int;
  captured_summary text;
begin
  -- Committed rows leave committed traces, and a Decision write also emits a
  -- surface broadcast. The topic goes last, after the deletes that emit their
  -- own, so this Room leaves nothing behind for another test file to count.
  cleanup_sql := format($cleanup$
    delete from public.decisions where room_id = %L;
    delete from public.messages where room_id = %L;
    delete from public.ai_tasks where room_id = %L;
    delete from public.workspaces where id = %L;
    delete from auth.users where id in (%L, %L);
    delete from realtime.messages where topic = %L;
  $cleanup$, fixture_room, fixture_room, fixture_room, fixture_workspace,
     fixture_user_a, fixture_user_b, 'room:' || fixture_room);

  -- dblink authenticates with a password, which the loopback route does not
  -- ask for, so a second session is reachable only over the TCP address this
  -- session already came in on. `supabase test db` connects that way.
  if inet_server_addr() is null
    or not exists (select 1 from pg_available_extensions where name = 'dblink')
  then
    insert into concurrent_capture (available) values (false);
    return;
  end if;

  execute 'create extension if not exists dblink with schema extensions';

  if not exists (
    select 1
    from pg_extension as installed
    join pg_namespace as namespace on namespace.oid = installed.extnamespace
    where installed.extname = 'dblink' and namespace.nspname = 'extensions'
  ) then
    insert into concurrent_capture (available) values (false);
    return;
  end if;

  connection_string := format(
    'host=%s port=%s dbname=%s user=postgres password=postgres',
    host(inet_server_addr()), current_setting('port'), current_database()
  );

  begin
    perform extensions.dblink_connect('proposal_a', connection_string);
    perform extensions.dblink_connect('proposal_b', connection_string);
  exception when others then
    insert into concurrent_capture (available) values (false);
    return;
  end;

  begin
    -- Self-healing: an earlier run that died between these fixtures and their
    -- removal must not leave rows behind for the rest of the suite to count.
    perform extensions.dblink_exec('proposal_a', cleanup_sql);

    -- One statement, so the fixtures commit all together or not at all.
    perform extensions.dblink_exec('proposal_a', format($fixtures$
      insert into auth.users (
        id, aud, role, email, encrypted_password, email_confirmed_at,
        raw_app_meta_data, raw_user_meta_data, created_at, updated_at
      )
      values
        (%L, 'authenticated', 'authenticated', 'concurrent-a@example.com', '',
         now(), '{"provider":"email","providers":["email"]}', '{}', now(), now()),
        (%L, 'authenticated', 'authenticated', 'concurrent-b@example.com', '',
         now(), '{"provider":"email","providers":["email"]}', '{}', now(), now());
      insert into public.workspaces (id, name, created_by)
        values (%L, 'Concurrent Capture', %L);
      insert into public.memberships (workspace_id, user_id, role)
        values (%L, %L, 'member');
      insert into public.projects (id, workspace_id, name, created_by)
        values (%L, %L, 'Concurrent Project', %L);
      insert into public.rooms (id, workspace_id, project_id, name, owner_id)
        values (%L, %L, %L, 'Concurrent Room', %L);
      insert into public.room_participants (room_id, user_id, access, added_by)
        values (%L, %L, 'view', %L);
      insert into public.execution_devices (
        id, user_id, name, platform, token_hash, status
      ) values (%L, %L, 'Concurrent Mac', 'macos', repeat('b', 64), 'active');
      insert into public.ai_tasks (
        id, initiating_user_id, workspace_id, room_id, device_id, provider,
        kind, status, instruction, context_manifest_json
      ) values (
        %L, %L, %L, %L, %L, 'codex', 'room_reply', 'completed',
        'Concurrent capture fixture',
        '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
      );
      insert into public.messages (
        id, room_id, client_id, author_type, author_id, initiated_by,
        ai_task_id, provider, body, proposed_action
      ) values (
        %L, %L, %L, 'product_agent', null, %L, %L, 'codex',
        'Two participants confirm this at the same moment.',
        '{"kind":"decision_capture","summary":"Recovery codes stay single-use.","sourceMessageId":null}'
      );
    $fixtures$,
      fixture_user_a, fixture_user_b,
      fixture_workspace, fixture_user_a,
      fixture_workspace, fixture_user_b,
      fixture_project, fixture_workspace, fixture_user_a,
      fixture_room, fixture_workspace, fixture_project, fixture_user_a,
      fixture_room, fixture_user_b, fixture_user_a,
      fixture_device, fixture_user_a,
      fixture_task, fixture_user_a, fixture_workspace, fixture_room,
      fixture_device,
      fixture_message, fixture_room, fixture_client, fixture_user_a,
      fixture_task
    ));

    -- Session A confirms and keeps its transaction open, holding the lock the
    -- capture function takes on the proposal message.
    perform extensions.dblink_exec('proposal_a', 'begin');
    perform * from extensions.dblink('proposal_a', format(
      'select set_config(%L, %L, false)', 'request.jwt.claim.sub', fixture_user_a
    )) as claim(value text);
    select confirmed.decision_id::uuid
    into first_id
    from extensions.dblink('proposal_a', capture_call)
      as confirmed(decision_id text);

    -- Session B asks for the same capture while A still holds that lock. The
    -- request is sent asynchronously, so B is genuinely waiting on A rather
    -- than running after it. lock_timeout means a lock that never frees fails
    -- this test instead of hanging the suite.
    perform extensions.dblink_exec('proposal_b', 'set lock_timeout = ''10s''');
    perform extensions.dblink_exec('proposal_b', 'begin');
    perform * from extensions.dblink('proposal_b', format(
      'select set_config(%L, %L, false)', 'request.jwt.claim.sub', fixture_user_b
    )) as claim(value text);
    perform extensions.dblink_send_query('proposal_b', capture_call);

    perform extensions.dblink_exec('proposal_a', 'commit');

    select confirmed.decision_id::uuid
    into second_id
    from extensions.dblink_get_result('proposal_b')
      as confirmed(decision_id text);
    perform * from extensions.dblink_get_result('proposal_b')
      as drained(decision_id text);
    perform extensions.dblink_exec('proposal_b', 'commit');

    select count(*), max(decision.summary)
    into captured_count, captured_summary
    from public.decisions as decision
    where decision.proposal_message_id = fixture_message::uuid;

    select count(*)
    into accepted
    from public.message_proposal_responses as response
    where response.message_id = fixture_message::uuid
      and response.response = 'accepted';

    perform extensions.dblink_exec('proposal_a', cleanup_sql);
  exception when others then
    begin
      perform extensions.dblink_exec('proposal_a', 'rollback');
    exception when others then null;
    end;
    begin
      perform extensions.dblink_exec('proposal_b', 'rollback');
    exception when others then null;
    end;
    begin
      perform extensions.dblink_exec('proposal_a', cleanup_sql);
    exception when others then null;
    end;
    perform extensions.dblink_disconnect('proposal_a');
    perform extensions.dblink_disconnect('proposal_b');
    raise;
  end;

  perform extensions.dblink_disconnect('proposal_a');
  perform extensions.dblink_disconnect('proposal_b');

  insert into concurrent_capture (
    available, first_decision_id, second_decision_id, decision_count,
    accepted_count, summary
  )
  values (true, first_id, second_id, captured_count, accepted, captured_summary);
end;
$concurrent$;

-- Reachability is asserted, never skipped. A skipped concurrency case counts
-- as a pass, which would leave exactly the gap this section exists to close.
select ok(
  (select available from concurrent_capture),
  'a second database session is reachable, so the concurrent case really ran'
);
select is(
  (select second_decision_id from concurrent_capture),
  (select first_decision_id from concurrent_capture),
  'a concurrent confirmation returns the Decision the other session wrote'
);
select is(
  (select decision_count from concurrent_capture),
  1,
  'two concurrent confirmations produce exactly one Decision'
);
select is(
  (select accepted_count from concurrent_capture),
  2,
  'each concurrent participant still records their own acceptance'
);
select is(
  (select summary from concurrent_capture),
  'Recovery codes stay single-use.',
  'the surviving Decision is the summary the Product Agent proposed'
);

select * from finish();
rollback;
