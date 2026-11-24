begin;
create extension if not exists pgtap with schema extensions;
select plan(4);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('ca000000-0000-4000-8000-000000000001','authenticated','authenticated','src-owner@example.com','',now(),'{}','{}',now(),now()),
  ('ca000000-0000-4000-8000-000000000002','authenticated','authenticated','src-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by)
values ('cb000000-0000-4000-8000-000000000001','Source workspace','ca000000-0000-4000-8000-000000000001');
insert into public.projects (id, workspace_id, name, created_by)
values ('cc000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000001','Source project','ca000000-0000-4000-8000-000000000001');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values ('cd000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000001','cc000000-0000-4000-8000-000000000001','Source room','ca000000-0000-4000-8000-000000000001');
insert into public.execution_devices (id, user_id, name, platform, token_hash, status)
values ('ce000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','Source Mac','macos',repeat('b',64),'active');
insert into public.provider_connections (user_id, device_id, provider, installation, authentication, compatibility)
values ('ca000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','codex','installed','authenticated','supported');
insert into public.ai_user_preferences (user_id, default_device_id, default_provider)
values ('ca000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','codex');
insert into public.ai_tasks (id, initiating_user_id, workspace_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json)
values ('cf000000-0000-4000-8000-000000000001','ca000000-0000-4000-8000-000000000001','cb000000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000001','ce000000-0000-4000-8000-000000000001','codex','room_reply','completed','Reply','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}');
insert into public.messages (id, room_id, client_id, author_type, initiated_by, ai_task_id, provider, body, proposed_action)
values ('d0000000-0000-4000-8000-000000000001','cd000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','product_agent','ca000000-0000-4000-8000-000000000001','cf000000-0000-4000-8000-000000000001','codex','I will design it.','{"kind":"design_screen","instruction":"A balance screen","name":"Balance","screenId":null}');

set local role authenticated;
select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000001',true);
create temporary table started as
select public.start_design_proposal('d0000000-0000-4000-8000-000000000001','A balance screen') as result;
grant select on started to authenticated;

select is((select count(*)::integer from public.list_design_screen_sources('cd000000-0000-4000-8000-000000000001')), 1,
  'a participant sees one source for the room');
select is((select message_id from public.list_design_screen_sources('cd000000-0000-4000-8000-000000000001')),
  'd0000000-0000-4000-8000-000000000001'::uuid, 'the source is the Orion reply that proposed the screen');
select is((select screen_id::text from public.list_design_screen_sources('cd000000-0000-4000-8000-000000000001')),
  (select result ->> 'screenId' from started), 'the source points at the built screen');

select set_config('request.jwt.claim.sub','ca000000-0000-4000-8000-000000000002',true);
select is((select count(*)::integer from public.list_design_screen_sources('cd000000-0000-4000-8000-000000000001')), 0,
  'someone outside the room sees nothing');

select * from finish();
rollback;
