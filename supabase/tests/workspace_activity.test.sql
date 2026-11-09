begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

select has_function('public'::name, 'list_workspace_activity'::name, array['uuid']::name[], 'activity reader exists');
select has_function('public'::name, 'mark_room_viewed'::name, array['uuid']::name[], 'mark viewed exists');
select has_function('public'::name, 'dismiss_room_attention'::name, array['uuid']::name[], 'dismiss exists');
select ok(
  not has_function_privilege('anon', 'public.list_workspace_activity(uuid)', 'EXECUTE'),
  'anonymous users cannot read activity'
);
select ok(
  not has_table_privilege('authenticated', 'public.room_views', 'SELECT'),
  'room_views is only reachable through the functions'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('a1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'activity-owner@example.com', '', now(), '{}', '{}', now(), now()),
  ('a1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'activity-outsider@example.com', '', now(), '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values ('a2000000-0000-4000-8000-000000000001', 'Activity workspace',
        'a1000000-0000-4000-8000-000000000001');

insert into public.projects (id, workspace_id, name, created_by)
values ('a7000000-0000-4000-8000-000000000001', 'a2000000-0000-4000-8000-000000000001',
        'Activity project', 'a1000000-0000-4000-8000-000000000001');

-- R1 working, R2 stuck, R3 finished-unseen, R4 finished-seen, R5 asked,
-- R6 idle, R7 stuck-dismissed, R8 asked-answered.
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
select ('a4000000-0000-4000-8000-00000000000' || n)::uuid,
       'a2000000-0000-4000-8000-000000000001',
       'a7000000-0000-4000-8000-000000000001',
       'Room ' || n,
       'a1000000-0000-4000-8000-000000000001'
from generate_series(1, 8) as n;

insert into public.execution_devices (id, user_id, name, platform, token_hash, status)
values ('a3000000-0000-4000-8000-000000000001', 'a1000000-0000-4000-8000-000000000001',
        'Activity Mac', 'macos', repeat('b', 64), 'active');

-- (task suffix, room suffix, status, hours ago)
insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json, agent_kind,
  created_at, updated_at
)
select ('a5000000-0000-4000-8000-0000000000' || lpad(t.task, 2, '0'))::uuid,
       'a1000000-0000-4000-8000-000000000001',
       'a2000000-0000-4000-8000-000000000001',
       ('a4000000-0000-4000-8000-00000000000' || t.room)::uuid,
       'a3000000-0000-4000-8000-000000000001',
       'claude', 'room_reply', t.status::public.ai_task_status,
       'Activity fixture ' || t.task,
       '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb,
       'product',
       now() - make_interval(hours => t.hours),
       now() - make_interval(hours => t.hours)
from (values
  ('1', '1', 'failed',    5),
  ('2', '1', 'running',   1),
  ('3', '2', 'failed',    1),
  ('4', '3', 'completed', 1),
  ('5', '4', 'completed', 2),
  ('6', '5', 'completed', 3),
  ('7', '7', 'failed',    2),
  ('8', '8', 'completed', 3)
) as t(task, room, status, hours);

-- Agent replies carrying proposals in R5 (unanswered) and R8 (answered).
insert into public.messages (
  id, room_id, client_id, author_type, author_id, initiated_by,
  ai_task_id, provider, body, proposed_action, created_at
)
values
  ('a6000000-0000-4000-8000-000000000005', 'a4000000-0000-4000-8000-000000000005',
   'a6100000-0000-4000-8000-000000000005', 'product_agent', null,
   'a1000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000006',
   'claude', 'Shall I map the user flow?', '{"kind":"user_flow_generate"}'::jsonb,
   now() - interval '3 hours'),
  ('a6000000-0000-4000-8000-000000000008', 'a4000000-0000-4000-8000-000000000008',
   'a6100000-0000-4000-8000-000000000008', 'product_agent', null,
   'a1000000-0000-4000-8000-000000000001', 'a5000000-0000-4000-8000-000000000008',
   'claude', 'Shall I map the user flow?', '{"kind":"user_flow_generate"}'::jsonb,
   now() - interval '3 hours');

insert into public.message_proposal_responses (message_id, user_id, response)
values ('a6000000-0000-4000-8000-000000000008', 'a1000000-0000-4000-8000-000000000001', 'dismissed');

insert into public.room_views (user_id, room_id, last_viewed_at, dismissed_at)
values
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000004', now() - interval '1 hour', null),
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000005', now() - interval '1 hour', null),
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000006', now() - interval '1 hour', null),
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000007', null, now() - interval '1 hour'),
  ('a1000000-0000-4000-8000-000000000001', 'a4000000-0000-4000-8000-000000000008', now() - interval '1 hour', null);

-- Created before switching role; the function still reads the caller from
-- the JWT claim when the view is queried.
create temporary view activity as
select room_id, state || '/' || coalesce(reason, '') as verdict, proposal_kind, proposal_message_id
from public.list_workspace_activity('a2000000-0000-4000-8000-000000000001');
grant select on activity to authenticated;

set local role authenticated;
select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000001', true);

select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000001'), 'working/', 'a running task wins over an older failure');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000002'), 'needs_you/stuck', 'a failed latest task is stuck');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000003'), 'needs_you/finished', 'unseen completed work is finished');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000004'), 'idle/', 'completed work seen afterwards is idle');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000005'), 'needs_you/asked', 'an unanswered offered proposal is asked');
select is((select proposal_kind from activity where room_id = 'a4000000-0000-4000-8000-000000000005'), 'user_flow_generate', 'asked rows carry the proposal kind');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000006'), 'idle/', 'a room with no work is idle');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000007'), 'idle/', 'a dismissed failure is idle');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000008'), 'idle/', 'an answered proposal is not asked');

select lives_ok($$ select public.mark_room_viewed('a4000000-0000-4000-8000-000000000003') $$, 'owner can mark a room viewed');
-- now() is the transaction start, which is after the task's updated_at.
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000003'), 'idle/', 'viewing clears finished');

select lives_ok($$ select public.dismiss_room_attention('a4000000-0000-4000-8000-000000000002') $$, 'owner can dismiss a stuck room');
select is((select verdict from activity where room_id = 'a4000000-0000-4000-8000-000000000002'), 'idle/', 'dismissing clears stuck');

select set_config('request.jwt.claim.sub', 'a1000000-0000-4000-8000-000000000002', true);
select is((select count(*)::int from public.list_workspace_activity('a2000000-0000-4000-8000-000000000001')), 0, 'outsiders see no rooms');
select throws_ok($$ select public.mark_room_viewed('a4000000-0000-4000-8000-000000000003') $$, '42501', null, 'outsiders cannot mark rooms viewed');

reset role;
-- R6 has a view row but no tasks or messages, so nothing else blocks the delete.
delete from public.rooms where id = 'a4000000-0000-4000-8000-000000000006';
select is((select count(*)::int from public.room_views where room_id = 'a4000000-0000-4000-8000-000000000006'), 0, 'deleting a room deletes its views');

select * from finish();
rollback;
