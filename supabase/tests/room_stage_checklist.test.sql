begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

select has_table(
  'public'::name,
  'room_stage_checklist_items'::name,
  'manual checklist confirmations are durable'::text
);
select col_is_pk(
  'public'::name,
  'room_stage_checklist_items'::name,
  array['room_id'::name, 'item_key'::name],
  'one row exists per room + item'::text
);
select has_function(
  'public'::name,
  'set_room_checklist_item'::name,
  array['uuid'::name, 'text'::name, 'boolean'::name],
  'the toggle function exists'::text
);
select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'room_stage_checklist_items'
  ),
  'checklist changes are published through Realtime'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.room_stage_checklist_items', 'INSERT'
  ),
  'authenticated users cannot insert checklist rows directly'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('13000000-0000-4000-8000-000000000001','authenticated','authenticated','chk-owner@example.com','',now(),'{}','{}',now(),now()),
  ('13000000-0000-4000-8000-000000000002','authenticated','authenticated','chk-viewer@example.com','',now(),'{}','{}',now(),now()),
  ('13000000-0000-4000-8000-000000000003','authenticated','authenticated','chk-editor@example.com','',now(),'{}','{}',now(),now()),
  ('13000000-0000-4000-8000-000000000004','authenticated','authenticated','chk-outsider@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  '23000000-0000-4000-8000-000000000001',
  'Checklist Workspace',
  '13000000-0000-4000-8000-000000000001'
);

insert into public.projects (id, workspace_id, name, created_by)
values (
  '73000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  'Checklist Project',
  '13000000-0000-4000-8000-000000000001'
);

insert into public.memberships (workspace_id, user_id, role)
values
  ('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000002','member'),
  ('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000003','member'),
  ('23000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000004','member');

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  '43000000-0000-4000-8000-000000000001',
  '23000000-0000-4000-8000-000000000001',
  '73000000-0000-4000-8000-000000000001',
  'Checklist room',
  '13000000-0000-4000-8000-000000000001'
);

insert into public.room_participants (room_id, user_id, access, added_by)
values
  ('43000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000002','view','13000000-0000-4000-8000-000000000001'),
  ('43000000-0000-4000-8000-000000000001','13000000-0000-4000-8000-000000000003','edit','13000000-0000-4000-8000-000000000001');

set local role authenticated;

-- View-only participant is refused.
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.set_room_checklist_item('43000000-0000-4000-8000-000000000001','problem_framed',true) $$,
  'P0001',
  'Room checklist edit access required',
  'a view-only participant cannot toggle a checklist item'
);

-- Non-participant is refused.
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$ select public.set_room_checklist_item('43000000-0000-4000-8000-000000000001','problem_framed',true) $$,
  'P0001',
  'Room checklist edit access required',
  'a nonparticipant cannot toggle a checklist item'
);

-- Editor confirms, then clears.
select set_config('request.jwt.claim.sub','13000000-0000-4000-8000-000000000003',true);
select is(
  public.set_room_checklist_item('43000000-0000-4000-8000-000000000001','problem_framed',true),
  true,
  'an editor confirms a checklist item'
);
select is(
  (select checked_by from public.room_stage_checklist_items
   where room_id = '43000000-0000-4000-8000-000000000001' and item_key = 'problem_framed'),
  auth.uid(),
  'the confirmation is stamped with the editor'
);
select is(
  public.set_room_checklist_item('43000000-0000-4000-8000-000000000001','problem_framed',false),
  false,
  'an editor clears a checklist item'
);
select is(
  (select count(*)::int from public.room_stage_checklist_items
   where room_id = '43000000-0000-4000-8000-000000000001'),
  0,
  'clearing removes the row'
);

select * from finish();
rollback;
