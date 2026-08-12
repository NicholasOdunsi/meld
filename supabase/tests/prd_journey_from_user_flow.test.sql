begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

-- One owner, one workspace (auto-membership), one project, two rooms: room F
-- has a generated user flow, room N has none. A device to own the AI tasks.
insert into auth.users (id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','owner@example.com','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values ('20000000-0000-4000-8000-000000000001','Workspace','10000000-0000-4000-8000-000000000001');

insert into public.projects (id, workspace_id, name, created_by)
values ('70000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','Project','10000000-0000-4000-8000-000000000001');

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values
  ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000007','Room F','10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000007','Room N','10000000-0000-4000-8000-000000000001');

insert into public.execution_devices (id, user_id, name, platform, token_hash, status)
values ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Mac','macos',repeat('1',64),'active');

-- Room F's generated user flow (the canvas graph). The generation row needs a
-- task to hang off, so a completed user_flow_generate task is inserted first.
insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json, context_revision)
values (
  '60000000-0000-4000-8000-0000000000f0','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','codex','user_flow_generate','completed',
  'flow','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb,0);

insert into public.user_flow_generations (task_id, room_id, workspace_id, initiating_user_id, document)
values (
  '60000000-0000-4000-8000-0000000000f0','40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  jsonb_build_object(
    'title','Canvas Flow',
    'summary','The flow drawn on the canvas.',
    'nodes', jsonb_build_array(
      jsonb_build_object('id','start','kind','start','label','Start','detail',null),
      jsonb_build_object('id','done','kind','end','label','Done','detail',null)),
    'edges', jsonb_build_array(
      jsonb_build_object('id','e1','from','start','to','done','label',null)),
    'openQuestions', jsonb_build_array()));

-- prd_generate in Room F: the model returns a *prose string* journey, which the
-- materialization must replace with the canvas flow.
insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json, context_revision)
values (
  '60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','codex','prd_generate','running',
  'Generate a PRD','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb,0);

update public.ai_tasks set status='completed',
  result_json = jsonb_build_object('kind','prd_generate','partial',false,'payload',
    jsonb_build_object('title','PRD F','userJourneys','a prose journey from the model'))
where id='60000000-0000-4000-8000-000000000001';

select is(
  (select jsonb_typeof(document->'userJourneys') from public.prds
   where source_task_id='60000000-0000-4000-8000-000000000001'),
  'object',
  'a room flow replaces the model prose journey with a structured flow');

select is(
  (select document->'userJourneys'->>'title' from public.prds
   where source_task_id='60000000-0000-4000-8000-000000000001'),
  'Canvas Flow',
  'the materialized journey is the room''s canvas flow');

-- prd_generate in Room N (no flow): the model's own journey is kept.
insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json, context_revision)
values (
  '60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002',
  '50000000-0000-4000-8000-000000000001','codex','prd_generate','running',
  'Generate a PRD','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb,0);

update public.ai_tasks set status='completed',
  result_json = jsonb_build_object('kind','prd_generate','partial',false,'payload',
    jsonb_build_object('title','PRD N','userJourneys','model journey kept'))
where id='60000000-0000-4000-8000-000000000002';

select is(
  (select document->>'userJourneys' from public.prds
   where source_task_id='60000000-0000-4000-8000-000000000002'),
  'model journey kept',
  'without a room flow the model journey is preserved');

select * from finish();
rollback;
