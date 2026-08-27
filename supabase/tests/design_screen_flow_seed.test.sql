begin;

create extension if not exists pgtap with schema extensions;

select plan(7);

-- Fixtures: a workspace, project, design-stage room, an editor participant,
-- and an outsider with no membership/participant row at all. Pattern mirrors
-- supabase/tests/design_task_rpcs.test.sql.

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('b0000000-0000-4000-8000-000000000001','authenticated','authenticated','seed-owner@example.com','',now(),'{}','{}',now(),now()),
  ('b0000000-0000-4000-8000-000000000002','authenticated','authenticated','seed-editor@example.com','',now(),'{}','{}',now(),now()),
  ('b0000000-0000-4000-8000-000000000003','authenticated','authenticated','seed-outsider@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  'b1000000-0000-4000-8000-000000000001',
  'Seed Workspace',
  'b0000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  'b2000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'Seed Project',
  'b0000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values
  ('b1000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','member');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  'b3000000-0000-4000-8000-000000000001',
  'b1000000-0000-4000-8000-000000000001',
  'b2000000-0000-4000-8000-000000000001',
  'Seed Room',
  'b0000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values
  ('b3000000-0000-4000-8000-000000000001','b0000000-0000-4000-8000-000000000002','edit','b0000000-0000-4000-8000-000000000001');

-- 1. Partial unique index exists.
select has_index(
  'public'::name,
  'design_screens'::name,
  'design_screens_room_flow_node'::name
);

-- 2. As the editor, seeding two action nodes creates two rows.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'b0000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*)::int from public.seed_design_screens_from_flow(
    'b3000000-0000-4000-8000-000000000001',
    '[{"node_id":"pick_plan","name":"Pick plan","x":0,"y":1200},
      {"node_id":"checkout","name":"Checkout","x":470,"y":1200}]'::jsonb)),
  2, 'seeds two action-node screens'
);

-- 3. Rows landed with flow_node_id, name, position, empty state.
select is(
  (select flow_node_id from public.design_screens
     where room_id = 'b3000000-0000-4000-8000-000000000001'
       and flow_node_id = 'pick_plan'),
  'pick_plan', 'seeded row carries flow_node_id'
);
select is(
  (select state::text from public.design_screens where flow_node_id = 'checkout'),
  'empty', 'seeded screen starts empty'
);

-- 4. Idempotent: re-seeding the same node inserts nothing.
select is(
  (select count(*)::int from public.seed_design_screens_from_flow(
    'b3000000-0000-4000-8000-000000000001',
    '[{"node_id":"pick_plan","name":"Pick plan","x":0,"y":1200}]'::jsonb)),
  0, 're-seeding an existing flow_node is a no-op'
);

-- 5. Deleting a seeded screen is permanent: the node is not seeded again.
-- Without this, the partial unique index (live rows only) stops matching once
-- the row is soft-deleted, so every later visit to the Canvas re-created the
-- screen the user had just removed.
select public.delete_design_screen(
  (select id from public.design_screens
     where room_id = 'b3000000-0000-4000-8000-000000000001'
       and flow_node_id = 'pick_plan')
);
select is(
  (select count(*)::int from public.seed_design_screens_from_flow(
    'b3000000-0000-4000-8000-000000000001',
    '[{"node_id":"pick_plan","name":"Pick plan","x":0,"y":1200}]'::jsonb)),
  0, 'a deleted flow_node screen is not reseeded'
);

-- 6. A non-editor (no membership, no room_participants row) cannot seed.
select set_config(
  'request.jwt.claim.sub',
  'b0000000-0000-4000-8000-000000000003',
  true
);
select throws_ok(
  $$ select public.seed_design_screens_from_flow(
       'b3000000-0000-4000-8000-000000000001',
       '[{"node_id":"other","name":"Other","x":0,"y":0}]'::jsonb) $$
);

select * from finish();
rollback;
