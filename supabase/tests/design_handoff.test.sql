begin;

create extension if not exists pgtap with schema extensions;

select plan(23);

select has_function(
  'public'::name,
  'create_design_handoff_snapshot'::name,
  array['uuid'::name],
  'the handoff snapshot RPC exists'::text
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_design_handoff_snapshot(uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot create handoff snapshots'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('96000000-0000-4000-8000-000000000001','authenticated','authenticated','handoff-owner@example.com','',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000002','authenticated','authenticated','handoff-editor@example.com','',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000003','authenticated','authenticated','handoff-viewer@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values
  ('97000000-0000-4000-8000-000000000001','Handoff Workspace','96000000-0000-4000-8000-000000000001'),
  ('97000000-0000-4000-8000-000000000003','Handoff Workspace B (no design profile)','96000000-0000-4000-8000-000000000001');
insert into public.projects (id, workspace_id, name, created_by)
values
  ('97000000-0000-4000-8000-000000000002','97000000-0000-4000-8000-000000000001','Handoff Project','96000000-0000-4000-8000-000000000001'),
  ('97000000-0000-4000-8000-000000000004','97000000-0000-4000-8000-000000000003','Handoff Project B','96000000-0000-4000-8000-000000000001');
insert into public.memberships (workspace_id, user_id, role)
values
  ('97000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','member'),
  ('97000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003','member');

-- Room A: exercises the RPC's manifest assembly, authorization, and immutability.
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  '98000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000002',
  'Handoff Room A',
  '96000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values
  ('98000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','edit','96000000-0000-4000-8000-000000000001'),
  ('98000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003','view','96000000-0000-4000-8000-000000000001');

-- Room B: exercises the atomic set_room_stage(design -> development) hook.
-- Lives in a separate workspace with no design-system profile, so it also
-- proves profile_version_id is null when the workspace has none active.
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  '98000000-0000-4000-8000-000000000002',
  '97000000-0000-4000-8000-000000000003',
  '97000000-0000-4000-8000-000000000004',
  'Handoff Room B',
  '96000000-0000-4000-8000-000000000001'
);

-- Screens for Room A: two built screens (out of canvas_x order on purpose),
-- one still-empty screen, and one built-but-soft-deleted screen. Only the
-- two built, non-deleted screens should appear in the manifest.
insert into public.design_screens (id, room_id, workspace_id, name, canvas_x, created_by)
values
  ('99000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001','Later Screen',200,'96000000-0000-4000-8000-000000000002'),
  ('99000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001','First Screen',50,'96000000-0000-4000-8000-000000000002'),
  ('99000000-0000-4000-8000-000000000003','98000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001','Still Empty Screen',10,'96000000-0000-4000-8000-000000000002'),
  ('99000000-0000-4000-8000-000000000004','98000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001','Deleted Screen',5,'96000000-0000-4000-8000-000000000002');

insert into public.design_screen_versions (
  id, screen_id, room_id, markup, styles, script, actions_json, promoted, created_by
)
values
  ('9a000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','<main>Later</main>','','','[]',true,'96000000-0000-4000-8000-000000000002'),
  ('9a000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000001','<main>First</main>','','','[]',true,'96000000-0000-4000-8000-000000000002'),
  ('9a000000-0000-4000-8000-000000000004','99000000-0000-4000-8000-000000000004','98000000-0000-4000-8000-000000000001','<main>Deleted</main>','','','[]',true,'96000000-0000-4000-8000-000000000002');

update public.design_screens
set current_version_id = '9a000000-0000-4000-8000-000000000001', state = 'built'
where id = '99000000-0000-4000-8000-000000000001';
update public.design_screens
set current_version_id = '9a000000-0000-4000-8000-000000000002', state = 'built'
where id = '99000000-0000-4000-8000-000000000002';
update public.design_screens
set current_version_id = '9a000000-0000-4000-8000-000000000004', state = 'built', deleted_at = now()
where id = '99000000-0000-4000-8000-000000000004';

-- An active design-system profile for the workspace.
insert into public.design_system_profile_versions (
  id, workspace_id, profile_json, token_css, created_by
)
values (
  '9b000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  '{"colors":[],"typeScale":[],"spacing":[],"radii":[],"components":[]}',
  ':root {}',
  '96000000-0000-4000-8000-000000000001'
);
insert into public.design_system_profiles (workspace_id, active_version_id)
values (
  '97000000-0000-4000-8000-000000000001',
  '9b000000-0000-4000-8000-000000000001'
);

-- PRDs for Room A: versions 1 and 3 (a gap on purpose); prd_revision should
-- be the max, not a count.
insert into public.prds (id, room_id, workspace_id, version, document, owner_id, created_by)
values
  ('9c000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001',1,'{"title":"v1"}','96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001'),
  ('9c000000-0000-4000-8000-000000000002','98000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001',3,'{"title":"v3"}','96000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000001');

set local role authenticated;

select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-4000-8000-000000000002',
  true
);
select lives_ok(
  $$ select public.create_design_handoff_snapshot('98000000-0000-4000-8000-000000000001') $$,
  'an editor can create a handoff snapshot'
);
select is(
  (select count(*)::integer from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000001'),
  1,
  'exactly one snapshot row is created for room A'
);
select is(
  (select manifest_json -> 'screens' from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000001'),
  jsonb_build_array(
    jsonb_build_object(
      'screenId', '99000000-0000-4000-8000-000000000002',
      'name', 'First Screen',
      'currentVersionId', '9a000000-0000-4000-8000-000000000002'
    ),
    jsonb_build_object(
      'screenId', '99000000-0000-4000-8000-000000000001',
      'name', 'Later Screen',
      'currentVersionId', '9a000000-0000-4000-8000-000000000001'
    )
  ),
  'manifest screens are exactly the built, non-deleted screens ordered by canvas_x'
);
select is(
  (select start_screen_id from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000001'),
  '99000000-0000-4000-8000-000000000002'::uuid,
  'start_screen_id is the earliest built screen by canvas_x'
);
select is(
  (select prd_revision from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000001'),
  3,
  'prd_revision is the max prd version for the room'
);
select is(
  (select profile_version_id from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000001'),
  '9b000000-0000-4000-8000-000000000001'::uuid,
  'profile_version_id is the workspace active profile version'
);

select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-4000-8000-000000000003',
  true
);
select throws_ok(
  $$ select public.create_design_handoff_snapshot('98000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'not_authorized',
  'a view-only participant cannot create a handoff snapshot'
);

reset role;
select throws_ok(
  $$ update public.design_handoff_snapshots set prd_revision = 999
    where room_id = '98000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'design_handoff_immutable',
  'a handoff snapshot cannot be updated'
);
select throws_ok(
  $$ delete from public.design_handoff_snapshots
    where room_id = '98000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'design_handoff_immutable',
  'a handoff snapshot cannot be deleted'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-4000-8000-000000000001',
  true
);

select is(
  (select count(*)::integer from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000002'),
  0,
  'no snapshot exists for room B before any stage transitions'
);
select lives_ok(
  $$ select public.set_room_stage('98000000-0000-4000-8000-000000000002', 'define') $$,
  'owner can move room B from discovery to define'
);
select is(
  (select count(*)::integer from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000002'),
  0,
  'a non-design-to-development transition writes no snapshot'
);
select lives_ok(
  $$ select public.set_room_stage('98000000-0000-4000-8000-000000000002', 'design') $$,
  'owner can move room B from define to design'
);
select is(
  (select count(*)::integer from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000002'),
  0,
  'moving into design still writes no snapshot'
);
select lives_ok(
  $$ select public.set_room_stage('98000000-0000-4000-8000-000000000002', 'development') $$,
  'owner can move room B from design to development'
);
select is(
  (select count(*)::integer from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000002'),
  1,
  'design to development writes exactly one snapshot'
);
select is(
  (select profile_version_id from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000002'),
  null::uuid,
  'profile_version_id is null when the workspace has no active design profile'
);
select is(
  (select manifest_json -> 'screens' from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000002'),
  '[]'::jsonb,
  'manifest screens is an empty array when the room has no built screens'
);
select is(
  (select start_screen_id from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000002'),
  null::uuid,
  'start_screen_id is null when the room has no built screens'
);
select lives_ok(
  $$ select public.set_room_stage('98000000-0000-4000-8000-000000000002', 'development') $$,
  'a no-op re-move to the same stage succeeds'
);
select is(
  (select count(*)::integer from public.design_handoff_snapshots
   where room_id = '98000000-0000-4000-8000-000000000002'),
  1,
  'a no-op re-move writes no additional snapshot'
);

select * from finish();
rollback;
