begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

select ok(to_regclass('public.design_proposal_handoffs') is not null,
  'handoff mapping exists');
select has_function('public', 'start_design_proposal', array['uuid', 'text']);
select ok(
  (select relrowsecurity from pg_catalog.pg_class
   where oid = 'public.design_proposal_handoffs'::regclass),
  'handoff mapping has row level security enabled'
);
select throws_ok(
  $$ select public.start_design_proposal('11111111-1111-4111-8111-111111111111', 'brief') $$,
  'P0001', 'Authentication required',
  'an anonymous caller cannot start a proposal'
);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('ba000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
  'handoff@example.com', '', now(), '{}', '{}', now(), now());
insert into public.workspaces (id, name, created_by)
values ('bb000000-0000-4000-8000-000000000001', 'Handoff Workspace',
  'ba000000-0000-4000-8000-000000000001');
insert into public.projects (id, workspace_id, name, created_by)
values ('bc000000-0000-4000-8000-000000000001',
  'bb000000-0000-4000-8000-000000000001', 'Handoff Project',
  'ba000000-0000-4000-8000-000000000001');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values ('bd000000-0000-4000-8000-000000000001',
  'bb000000-0000-4000-8000-000000000001',
  'bc000000-0000-4000-8000-000000000001', 'Handoff Room',
  'ba000000-0000-4000-8000-000000000001');
insert into public.execution_devices (id, user_id, name, platform, token_hash, status)
values ('c0000000-0000-4000-8000-000000000001',
  'ba000000-0000-4000-8000-000000000001', 'Handoff Mac', 'macos', repeat('a',64), 'active');
insert into public.provider_connections (user_id, device_id, provider, installation, authentication, compatibility)
values ('ba000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', 'codex', 'installed', 'authenticated', 'supported');
insert into public.ai_user_preferences (user_id, default_device_id, default_provider)
values ('ba000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001', 'codex');
insert into public.ai_tasks (id, initiating_user_id, workspace_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json)
values ('c1000000-0000-4000-8000-000000000001',
  'ba000000-0000-4000-8000-000000000001',
  'bb000000-0000-4000-8000-000000000001',
  'bd000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  'codex', 'room_reply', 'completed', 'Reply',
  '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}');
insert into public.messages (id, room_id, client_id, author_type, initiated_by,
  ai_task_id, provider, body, proposed_action)
values ('be000000-0000-4000-8000-000000000001',
  'bd000000-0000-4000-8000-000000000001',
  'bf000000-0000-4000-8000-000000000001', 'product_agent',
  'ba000000-0000-4000-8000-000000000001',
  'c1000000-0000-4000-8000-000000000001', 'codex', 'I will design it.',
  '{"kind":"design_screen","instruction":"A balance screen","name":"Balance","screenId":null}');

set local role authenticated;
select set_config('request.jwt.claim.sub', 'ba000000-0000-4000-8000-000000000001', true);
create temporary table handoff_results as
select public.start_design_proposal('be000000-0000-4000-8000-000000000001', 'A balance screen') as first_result;
alter table handoff_results add column retry_result jsonb;
update handoff_results set retry_result = public.start_design_proposal(
  'be000000-0000-4000-8000-000000000001', 'A balance screen');
select ok(first_result = retry_result, 'retry returns the same screen and task') from handoff_results;
reset role;
select is((select count(*)::integer from public.design_proposal_handoffs
  where message_id = 'be000000-0000-4000-8000-000000000001'), 1,
  'only one handoff mapping exists');
select is((select count(*)::integer from public.design_screen_generations g
  join public.design_proposal_handoffs h on h.task_id = g.task_id
  where h.message_id = 'be000000-0000-4000-8000-000000000001'), 1,
  'only one generation exists for the proposal');

select * from finish();
rollback;
