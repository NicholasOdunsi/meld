begin;
create extension if not exists pgtap with schema extensions;
select plan(15);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('d1000000-0000-4000-8000-000000000001','authenticated','authenticated','queue-owner@example.com','',now(),'{}','{}',now(),now()),
  ('d1000000-0000-4000-8000-000000000002','authenticated','authenticated','queue-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces(id,name,created_by)
values ('d2000000-0000-4000-8000-000000000001','Build Queue','d1000000-0000-4000-8000-000000000001');
insert into public.projects(id,workspace_id,name,created_by)
values ('d3000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','Application','d1000000-0000-4000-8000-000000000001');
insert into public.rooms(id,workspace_id,project_id,name,owner_id)
values ('d4000000-0000-4000-8000-000000000001','d2000000-0000-4000-8000-000000000001','d3000000-0000-4000-8000-000000000001','Main','d1000000-0000-4000-8000-000000000001');
insert into public.execution_devices(id,user_id,name,platform,token_hash,status)
values ('d5000000-0000-4000-8000-000000000001','d1000000-0000-4000-8000-000000000001','Mac','macos',repeat('d',64),'active');
insert into public.provider_connections(user_id,device_id,provider,installation,authentication,compatibility)
values ('d1000000-0000-4000-8000-000000000001','d5000000-0000-4000-8000-000000000001','claude','installed','authenticated','supported');

set local role authenticated;
select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.queue_build_task('d4000000-0000-4000-8000-000000000001','code_link','claude')$$,
  'P0001','invalid_build_task_request','outsiders cannot link another project');

select set_config('request.jwt.claim.sub','d1000000-0000-4000-8000-000000000001',true);
select throws_ok($$select public.queue_build_task('d4000000-0000-4000-8000-000000000001','code_link','claude',
  'd5000000-0000-4000-8000-000000000001',null,'{"kind":"folder","path":"/tmp/unsafe"}')$$,
  'P0001','invalid_build_task_request','a caller cannot supply a Mac path');
select set_config('test.link_task',public.queue_build_task('d4000000-0000-4000-8000-000000000001','code_link','claude',
  'd5000000-0000-4000-8000-000000000001',null,'{"kind":"folder","localSelectionId":"d6000000-0000-4000-8000-000000000001"}')::text,true);
select ok(not has_table_privilege('authenticated','public.build_task_jobs','SELECT'),
  'job internals are unavailable to a browser');

reset role;
update public.ai_tasks set status='ready_to_run' where id=current_setting('test.link_task')::uuid;
set local role service_role;
select set_config('test.link_attempt',public.claim_ai_task(current_setting('test.link_task')::uuid,
  'd5000000-0000-4000-8000-000000000001')->>'attemptId',true);
select is(public.hydrate_authorized_room_context(current_setting('test.link_task')::uuid,
  current_setting('test.link_attempt')::uuid)#>>'{context,target,kind}','folder','claimed link is hydrated');
select is(public.settle_ai_task(current_setting('test.link_task')::uuid,'d5000000-0000-4000-8000-000000000001',
  current_setting('test.link_attempt')::uuid,'complete',null,null,
  '{"kind":"code_link","partial":false,"payload":{"engineProjectId":"d3000000-0000-4000-8000-000000000001","displayName":"Scratch","repoUrl":null}}',false)::text,
  'completed','settlement materializes the code link');

set local role authenticated;
select is((select display_name from public.project_code_links),'Scratch','owner reads the new code link');
select set_config('test.turn_task',public.post_build_message('d4000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001','Add the login page','claude')->>'taskId',true);
select is(public.post_build_message('d4000000-0000-4000-8000-000000000001',
  'd7000000-0000-4000-8000-000000000001','Add the login page','claude')->>'taskId',current_setting('test.turn_task'),
  'reposting the same client message returns the existing turn');

reset role;
update public.ai_tasks set status='ready_to_run' where id=current_setting('test.turn_task')::uuid;
set local role service_role;
select set_config('test.turn_attempt',public.claim_ai_task(current_setting('test.turn_task')::uuid,
  'd5000000-0000-4000-8000-000000000001')->>'attemptId',true);
select is(public.hydrate_authorized_room_context(current_setting('test.turn_task')::uuid,
  current_setting('test.turn_attempt')::uuid)#>>'{context,text}','Add the login page','only the bound message is provided as input');
select throws_ok($$select public.append_ai_task_event(current_setting('test.turn_task')::uuid,
  'd5000000-0000-4000-8000-000000000001','d8000000-0000-4000-8000-000000000001',1,'build',
  '{"event":{"type":"status","status":"working"}}')$$, 'P0001','stale_ai_task_attempt','stale leases cannot project events');
select is(public.append_ai_task_event(current_setting('test.turn_task')::uuid,'d5000000-0000-4000-8000-000000000001',
  current_setting('test.turn_attempt')::uuid,1,'build','{"event":{"type":"approval_request","request":{"id":"request-1","summary":"Confirm","choices":[{"id":"decline","label":"Decline"}]}}}'),
  1::bigint,'the active lease projects a pending approval');

set local role authenticated;
select throws_ok($$select public.queue_build_task('d4000000-0000-4000-8000-000000000001','build_approval','claude',
  null,null,null,current_setting('test.turn_task')::uuid,null,'request-old','decline')$$,
  'P0001','build_approval_stale','only the current request can be answered');
select ok(public.queue_build_task('d4000000-0000-4000-8000-000000000001','build_approval','claude',
  null,null,null,current_setting('test.turn_task')::uuid,null,'request-1','decline') is not null,
  'the owner can queue approval while the turn still holds its lease');

set local role service_role;
select is(public.settle_ai_task(current_setting('test.turn_task')::uuid,'d5000000-0000-4000-8000-000000000001',
  current_setting('test.turn_attempt')::uuid,'complete',null,null,
  '{"kind":"build_turn","partial":false,"payload":{"status":"done"}}',false)::text,'completed','turn settlement succeeds');

set local role authenticated;
select is((select status from public.build_stars where star_task_id=current_setting('test.turn_task')::uuid),
  'done', 'the persisted summary contains the terminal build status');
select is((select pending_approval from public.build_stars where star_task_id=current_setting('test.turn_task')::uuid),
  null::jsonb, 'a settled build has no pending approval');

select * from finish();
rollback;
