begin;
create extension if not exists pgtap with schema extensions;
select plan(12);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
('b1000000-0000-4000-8000-000000000001','authenticated','authenticated','build-owner@example.com','',now(),'{}','{}',now(),now()),
('b1000000-0000-4000-8000-000000000002','authenticated','authenticated','build-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id,name,created_by) values ('b2000000-0000-4000-8000-000000000001','Build WS','b1000000-0000-4000-8000-000000000001');
insert into public.projects (id,workspace_id,name,created_by) values ('b3000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','App','b1000000-0000-4000-8000-000000000001');
insert into public.rooms (id,workspace_id,project_id,name,owner_id) values ('b4000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','Main','b1000000-0000-4000-8000-000000000001');
insert into public.execution_devices (id,user_id,name,platform,token_hash,status) values ('b5000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','Mac','macos',repeat('b',64),'active');
insert into public.ai_tasks (id,initiating_user_id,workspace_id,room_id,device_id,provider,kind,status,instruction,context_manifest_json)
values ('b6000000-0000-4000-8000-000000000001','b1000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001','b4000000-0000-4000-8000-000000000001','b5000000-0000-4000-8000-000000000001','claude','build_turn','queued','Add login','{}');
insert into public.room_stars (room_id,task_id,title) values ('b4000000-0000-4000-8000-000000000001','b6000000-0000-4000-8000-000000000001','Add login');

set local role service_role;
select lives_ok($$insert into public.project_code_links(project_id,kind,repo_url,display_name,device_id) values
  ('b3000000-0000-4000-8000-000000000001','github','https://github.com/owner/app','owner/app','b5000000-0000-4000-8000-000000000001')$$, 'service role links a GitHub repo');
select throws_ok($$insert into public.project_code_links(project_id,kind,repo_url,display_name,device_id) values
  ('b3000000-0000-4000-8000-000000000001','folder','https://github.com/owner/app','app','b5000000-0000-4000-8000-000000000001')$$, '23514', null, 'a folder link carries no repo url');
select throws_ok($$update public.project_code_links set kind='github', repo_url=null$$, '23514', null, 'a GitHub link needs a repo url');
select lives_ok($$insert into public.build_stars(star_task_id,project_id,branch,changed_files) values
  ('b6000000-0000-4000-8000-000000000001','b3000000-0000-4000-8000-000000000001','orion/add-login','[{"path":"a.ts","added":1,"removed":0}]')$$, 'service role records a build star');
select throws_ok($$update public.build_stars set status='paused'$$, '23514', null, 'unknown status rejected');
select throws_ok($$update public.build_stars set changed_files='{}'::jsonb$$, '23514', null, 'changed files must be an array');
reset role;
select ok(not has_table_privilege('anon','public.build_stars','SELECT'), 'anon cannot read build stars');
select ok(not has_table_privilege('authenticated','public.build_stars','INSERT'), 'clients cannot write build stars');

set local role authenticated;
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000001',true);
select is((select branch from public.build_stars), 'orion/add-login', 'owner reads the build star');
select is((select display_name from public.project_code_links), 'owner/app', 'owner reads the code link');
select set_config('request.jwt.claim.sub','b1000000-0000-4000-8000-000000000002',true);
select is((select count(*) from public.build_stars), 0::bigint, 'outsider sees no build stars');
select is((select count(*) from public.project_code_links), 0::bigint, 'outsider sees no code links');

select * from finish();
rollback;
