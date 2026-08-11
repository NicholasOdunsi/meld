begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

select has_table(
  'public'::name,
  'user_flows'::name,
  'user flow lifecycle metadata is durable'::text
);
select col_is_pk(
  'public'::name,
  'user_flows'::name,
  'room_id'::name,
  'one lifecycle row exists per room'::text
);
select has_function(
  'public'::name,
  'start_user_flow'::name,
  array['uuid'::name],
  'the idempotent start function exists'::text
);
select ok(
  exists (
    select 1
    from pg_publication_tables
    where pubname = 'supabase_realtime'
      and schemaname = 'public'
      and tablename = 'user_flows'
  ),
  'user flow lifecycle changes are published through Realtime'
);
select ok(
  not has_table_privilege('authenticated', 'public.user_flows', 'INSERT'),
  'authenticated users cannot insert lifecycle rows directly'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('12000000-0000-4000-8000-000000000001','authenticated','authenticated','flow-owner@example.com','',now(),'{}','{}',now(),now()),
  ('12000000-0000-4000-8000-000000000002','authenticated','authenticated','flow-viewer@example.com','',now(),'{}','{}',now(),now()),
  ('12000000-0000-4000-8000-000000000003','authenticated','authenticated','flow-editor@example.com','',now(),'{}','{}',now(),now()),
  ('12000000-0000-4000-8000-000000000004','authenticated','authenticated','flow-outsider@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  '22000000-0000-4000-8000-000000000001',
  'Lifecycle Workspace',
  '12000000-0000-4000-8000-000000000001'
);

insert into public.projects (id, workspace_id, name, created_by)
values (
  '72000000-0000-4000-8000-000000000001',
  '22000000-0000-4000-8000-000000000001',
  'Lifecycle Project',
  '12000000-0000-4000-8000-000000000001'
);

insert into public.memberships (workspace_id, user_id, role)
values
  ('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','member'),
  ('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000003','member'),
  ('22000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000004','member');

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values
  (
    '42000000-0000-4000-8000-000000000001',
    '22000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    'Editor-started flow',
    '12000000-0000-4000-8000-000000000001'
  ),
  (
    '42000000-0000-4000-8000-000000000002',
    '22000000-0000-4000-8000-000000000001',
    '72000000-0000-4000-8000-000000000001',
    'Owner-started flow',
    '12000000-0000-4000-8000-000000000001'
  );

insert into public.room_participants (room_id, user_id, access, added_by)
values
  ('42000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000002','view','12000000-0000-4000-8000-000000000001'),
  ('42000000-0000-4000-8000-000000000001','12000000-0000-4000-8000-000000000003','edit','12000000-0000-4000-8000-000000000001'),
  ('42000000-0000-4000-8000-000000000002','12000000-0000-4000-8000-000000000002','view','12000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);

select throws_ok(
  $$ select public.start_user_flow('42000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'User flow edit access required',
  'a view-only participant cannot start a user flow'
);

select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$ select public.start_user_flow('42000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'User flow edit access required',
  'a nonparticipant cannot start a user flow'
);

select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000003',true);
select is(
  (public.start_user_flow('42000000-0000-4000-8000-000000000001')).created_by,
  auth.uid(),
  'a room editor starts a user flow as themselves'
);
select is(
  (select count(*)::int from public.user_flows),
  1,
  'the first start creates one lifecycle row'
);
select is(
  (public.start_user_flow('42000000-0000-4000-8000-000000000001')).created_at,
  (
    select created_at
    from public.user_flows
    where room_id = '42000000-0000-4000-8000-000000000001'
  ),
  'an editor retry returns the authoritative lifecycle row'
);
select is(
  (select count(*)::int from public.user_flows),
  1,
  'an editor retry does not create another lifecycle row'
);

select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000001',true);
select is(
  (public.start_user_flow('42000000-0000-4000-8000-000000000001')).created_by,
  '12000000-0000-4000-8000-000000000003'::uuid,
  'an owner retry preserves the original creator'
);
select is(
  (public.start_user_flow('42000000-0000-4000-8000-000000000002')).created_by,
  auth.uid(),
  'a room owner can start a user flow'
);

select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000002',true);
select is(
  (select count(*)::int from public.user_flows),
  2,
  'a participant reads lifecycle metadata for their rooms'
);

select set_config('request.jwt.claim.sub','12000000-0000-4000-8000-000000000004',true);
select is(
  (select count(*)::int from public.user_flows),
  0,
  'a nonparticipant cannot read lifecycle metadata'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok(
  $$ select public.start_user_flow('42000000-0000-4000-8000-000000000001') $$,
  '42501',
  null,
  'anonymous users cannot execute the lifecycle RPC'
);

select * from finish();
rollback;
