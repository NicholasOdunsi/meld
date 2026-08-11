begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

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

select * from finish();
rollback;
