begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '11000000-0000-4000-8000-000000000001', 'authenticated',
  'authenticated', 'proposed-action@example.com', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.workspaces (id, name, created_by)
values (
  '21000000-0000-4000-8000-000000000001',
  'Proposed Actions',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.projects (id, workspace_id, name, created_by)
values (
  '71000000-0000-4000-8000-000000000007',
  '21000000-0000-4000-8000-000000000001',
  'Proposed Actions Project',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  '41000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '71000000-0000-4000-8000-000000000007',
  'Proposed Action Room',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.messages (id, room_id, client_id, author_id, body)
values (
  '61000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '61100000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'A human message cannot carry Product Agent actions.'
);

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values (
  '31000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  'Proposed Action Mac', 'macos', repeat('a', 64), 'active'
);

insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json
)
select
  ('72000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  '11000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'codex', 'room_reply', 'running',
  'Reply with proposed action fixture ' || value,
  '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
from generate_series(1, 7) as value;

insert into public.ai_task_attempts (
  id, task_id, device_id, attempt_no, lease_expires_at
)
select
  ('73000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  ('72000000-0000-4000-8000-' || lpad(value::text, 12, '0'))::uuid,
  '31000000-0000-4000-8000-000000000001',
  1,
  now() + interval '90 seconds'
from generate_series(1, 7) as value;

select public.settle_ai_task(
  '72000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  'complete', null, null,
  '{"kind":"room_reply","payload":{"response":"Generate the PRD when ready.","citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[],"proposedAction":{"kind":"prd_generate"}},"partial":false}'::jsonb,
  false
);

select public.settle_ai_task(
  '72000000-0000-4000-8000-000000000006',
  '31000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000006',
  'complete', null, null,
  '{"kind":"room_reply","payload":{"response":"Over-specified proposal.","citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[],"proposedAction":{"kind":"prd_generate","roomId":"41000000-0000-4000-8000-000000000001"}},"partial":false}'::jsonb,
  false
);

select public.settle_ai_task(
  '72000000-0000-4000-8000-000000000002',
  '31000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000002',
  'complete', null, null,
  '{"kind":"room_reply","payload":{"response":"No proposal.","citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[]},"partial":false}'::jsonb,
  false
);

select public.settle_ai_task(
  '72000000-0000-4000-8000-000000000003',
  '31000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000003',
  'complete', null, null,
  '{"kind":"room_reply","payload":{"response":"Explicitly no proposal.","citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[],"proposedAction":null},"partial":false}'::jsonb,
  false
);

select public.settle_ai_task(
  '72000000-0000-4000-8000-000000000004',
  '31000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000004',
  'complete', null, null,
  '{"kind":"room_reply","payload":{"response":"Unknown proposal.","citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[],"proposedAction":{"kind":"delete_room"}},"partial":false}'::jsonb,
  false
);

select public.settle_ai_task(
  '72000000-0000-4000-8000-000000000005',
  '31000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000005',
  'complete', null, null,
  '{"kind":"room_reply","payload":{"response":"Malformed proposal.","citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[],"proposedAction":"prd_generate"},"partial":false}'::jsonb,
  false
);

select public.settle_ai_task(
  '72000000-0000-4000-8000-000000000007',
  '31000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000007',
  'complete', null, null,
  '{"kind":"room_reply","payload":{"response":"I can update the PRD.","citedMessageIds":[],"citedEvidenceIds":[],"assumptions":[],"suggestedNextQuestions":[],"proposedAction":{"kind":"prd_revise"}},"partial":false}'::jsonb,
  false
);

select is(
  (
    select proposed_action ->> 'kind'
    from public.messages
    where ai_task_id = '72000000-0000-4000-8000-000000000001'
  ),
  'prd_generate',
  'a validated prd_generate proposal persists on the Product Agent message'
);

select is(
  (
    select proposed_action ->> 'kind'
    from public.messages
    where ai_task_id = '72000000-0000-4000-8000-000000000007'
  ),
  'prd_revise',
  'a validated prd_revise proposal persists on the Product Agent message'
);

select is(
  (
    select proposed_action
    from public.messages
    where ai_task_id = '72000000-0000-4000-8000-000000000002'
  ),
  null,
  'an absent proposed action persists no actionable data'
);

select is(
  (
    select proposed_action
    from public.messages
    where ai_task_id = '72000000-0000-4000-8000-000000000003'
  ),
  null,
  'a null proposed action persists no actionable data'
);

select is(
  (
    select proposed_action
    from public.messages
    where ai_task_id = '72000000-0000-4000-8000-000000000004'
  ),
  null,
  'an unknown proposed action persists no actionable data'
);

select is(
  (
    select proposed_action
    from public.messages
    where ai_task_id = '72000000-0000-4000-8000-000000000005'
  ),
  null,
  'a malformed proposed action persists no actionable data'
);

select is(
  (
    select proposed_action
    from public.messages
    where ai_task_id = '72000000-0000-4000-8000-000000000006'
  ),
  null,
  'a proposed action with extra keys persists no actionable data'
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
      '61100000-0000-4000-8000-000000000002',
      '11000000-0000-4000-8000-000000000001',
      'A forged action on insert.',
      '{"kind":"prd_generate"}'::jsonb
    )
  $$,
  '23514', null,
  'an authenticated human cannot insert a forged proposed action'
);

select throws_ok(
  $$
    update public.messages
    set proposed_action = '{"kind":"prd_generate"}'::jsonb
    where id = '61000000-0000-4000-8000-000000000001'
  $$,
  '23514', null,
  'an authenticated human cannot add a forged proposed action on update'
);

reset role;

select throws_ok(
  $$
    update public.messages
    set proposed_action =
      '{"kind":"prd_generate","roomId":"forged"}'::jsonb
    where ai_task_id = '72000000-0000-4000-8000-000000000001'
  $$,
  '23514', null,
  'a non-null proposed action must equal the exact canonical object'
);

select * from finish();
rollback;
