begin;

create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','route-owner@example.com','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','route-viewer@example.com','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values ('20000000-0000-4000-8000-000000000001','Star routing','10000000-0000-4000-8000-000000000001');
insert into public.projects (id, workspace_id, name, created_by)
values ('70000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','Routing project','10000000-0000-4000-8000-000000000001');
insert into public.memberships (workspace_id, user_id, role)
values ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000007','Routing room','10000000-0000-4000-8000-000000000001');
insert into public.room_participants (room_id, user_id, access, added_by)
values ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','view','10000000-0000-4000-8000-000000000001');
insert into public.execution_devices (id, user_id, name, platform, token_hash, status)
values ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Routing Mac','macos',repeat('1',64),'active');
insert into public.provider_connections (user_id, device_id, provider, installation, authentication, compatibility)
values ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','codex','installed','authenticated','supported');

insert into public.ai_tasks (id, initiating_user_id, workspace_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json, result_json)
values
  ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','codex','star_route','completed','Classify this','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}', '{"kind":"star_route","payload":{"decision":"continue","starTaskId":"60000000-0000-4000-8000-000000000002","confidence":0.9},"partial":false}'),
  ('60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','codex','star_route','queued','Still running','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}', null);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

select lives_ok($$select public.create_ai_task(
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'codex', 'star_route', '{"message":"Continue","stars":[]}',
  '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
)$$, 'an owner can create a route task before posting a message');
select is(public.read_star_route_result('60000000-0000-4000-8000-000000000001')->>'decision',
  'continue', 'the owner can read the route decision');
select is(public.read_star_route_result('60000000-0000-4000-8000-000000000001')->>'starTaskId',
  '60000000-0000-4000-8000-000000000002', 'the result includes only the chosen Star id');
select is(public.read_star_route_result('60000000-0000-4000-8000-000000000001')->>'intent',
  'answer', 'a stored result without intent defaults to answer');
select is(public.read_star_route_result('60000000-0000-4000-8000-000000000003'),
  null::jsonb, 'a pending task has no route result');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select is(public.read_star_route_result('60000000-0000-4000-8000-000000000001'),
  null::jsonb, 'another room participant cannot read the owners private route');

select * from finish();
rollback;
