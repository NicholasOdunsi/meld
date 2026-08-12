begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

-- One owner (auto-added as an edit participant of the rooms they own), a
-- workspace, a project, and two rooms: room D has a draft PRD, room A an
-- accepted one.
insert into auth.users (id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','owner@example.com','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values ('20000000-0000-4000-8000-000000000001','Workspace','10000000-0000-4000-8000-000000000001');

insert into public.projects (id, workspace_id, name, created_by)
values ('70000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','Project','10000000-0000-4000-8000-000000000001');

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values
  ('40000000-0000-4000-8000-00000000000d','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000007','Room D','10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000007','Room A','10000000-0000-4000-8000-000000000001');

insert into public.prds (room_id, workspace_id, version, status, document, owner_id, created_by)
values
  ('40000000-0000-4000-8000-00000000000d','20000000-0000-4000-8000-000000000001',1,'draft',
    '{"title":"PRD D","userJourneys":"an old prose journey"}'::jsonb,
    '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-00000000000a','20000000-0000-4000-8000-000000000001',1,'accepted',
    '{"title":"PRD A","userJourneys":"an accepted journey"}'::jsonb,
    '10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');

-- Act as the room owner (an edit participant).
set local role authenticated;
select set_config('request.jwt.claims',
  json_build_object('sub','10000000-0000-4000-8000-000000000001')::text, true);

-- A draft PRD is updated in place.
select public.set_prd_user_journeys(
  '40000000-0000-4000-8000-00000000000d',
  '{"title":"Canvas Edited","summary":"s","nodes":[],"edges":[],"openQuestions":[]}'::jsonb);

select is(
  (select document->'userJourneys'->>'title' from public.prds
   where room_id='40000000-0000-4000-8000-00000000000d' order by version desc limit 1),
  'Canvas Edited',
  'a draft PRD journey is replaced with the canvas flow');

select is(
  (select count(*)::int from public.prds
   where room_id='40000000-0000-4000-8000-00000000000d'),
  1,
  'updating a draft does not create a new version');

-- An accepted PRD spawns a new draft version instead of mutating the accepted one.
select public.set_prd_user_journeys(
  '40000000-0000-4000-8000-00000000000a',
  '{"title":"Canvas On Accepted","summary":"s","nodes":[],"edges":[],"openQuestions":[]}'::jsonb);

select is(
  (select count(*)::int from public.prds
   where room_id='40000000-0000-4000-8000-00000000000a'),
  2,
  'editing over an accepted PRD creates a new draft version');

select is(
  (select status || ':' || (document->'userJourneys'->>'title') from public.prds
   where room_id='40000000-0000-4000-8000-00000000000a' order by version desc limit 1),
  'draft:Canvas On Accepted',
  'the new version is a draft carrying the canvas flow');

reset role;
select * from finish();
rollback;
