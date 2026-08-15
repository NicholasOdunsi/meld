begin;

create extension if not exists pgtap with schema extensions;

select plan(6);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('aa000000-0000-4000-8000-000000000001','authenticated','authenticated','layout-owner@example.com','',now(),'{}','{}',now(),now()),
  ('aa000000-0000-4000-8000-000000000002','authenticated','authenticated','layout-editor@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  'ab000000-0000-4000-8000-000000000001',
  'Layouts Workspace',
  'aa000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  'ac000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'Layouts Project',
  'aa000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values
  ('ab000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000002','member');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  'ad000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001',
  'Layouts Room',
  'aa000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values
  ('ad000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000002','edit','aa000000-0000-4000-8000-000000000001');

-- 1. tables exist
select has_table('public','design_layouts','design_layouts table exists');
select has_table('public','design_layout_versions','design_layout_versions table exists');

-- 2. design_screens gained layout_id
select has_column('public','design_screens','layout_id','design_screens has layout_id');

-- 3. a layout + version can be created and promoted via the RPC
insert into public.design_layouts (id, room_id, workspace_id, layout_key, name, created_by)
values ('b1000000-0000-4000-8000-000000000001','ad000000-0000-4000-8000-000000000001',
        'ab000000-0000-4000-8000-000000000001','app-shell','App Shell',
        'aa000000-0000-4000-8000-000000000002');

select lives_ok($$
  select public.insert_and_promote_layout_version(
    'b1000000-0000-4000-8000-000000000001',
    '<aside>nav</aside><main data-meld-slot></main>',
    'aside{display:block}',
    '[{"id":"nav-home","label":"Home","targetScreenKey":"home"}]'::jsonb,
    null, null, null, 'aa000000-0000-4000-8000-000000000002')
$$, 'insert_and_promote_layout_version succeeds');

select is(
  (select promoted from public.design_layout_versions
   where layout_id = 'b1000000-0000-4000-8000-000000000001'),
  true, 'first layout version promotes');

select is(
  (select dl.current_version_id is not null from public.design_layouts dl
   where dl.id = 'b1000000-0000-4000-8000-000000000001'),
  true, 'promoted version becomes the layout current version');

select * from finish();
rollback;
