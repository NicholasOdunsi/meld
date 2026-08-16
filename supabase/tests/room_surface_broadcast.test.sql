begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

select has_function(
  'public'::name,
  'broadcast_room_surface_change'::name,
  array[]::name[],
  'the Room surface broadcast trigger function exists'::text
);
select function_returns(
  'public'::name,
  'broadcast_room_surface_change'::name,
  array[]::name[],
  'trigger'::name,
  'the broadcast function is a trigger'::text
);
select ok(
  not has_function_privilege(
    'anon',
    'public.broadcast_room_surface_change()',
    'EXECUTE'
  ),
  'anonymous users cannot invoke the trigger function directly'
);
select has_trigger(
  'public'::name,
  'user_flows'::name,
  'user_flows_broadcast_room_surface_change'::name,
  'user flow changes broadcast Room surface invalidation'::text
);
select has_trigger(
  'public'::name,
  'decisions'::name,
  'decisions_broadcast_room_surface_change'::name,
  'decision changes broadcast Room surface invalidation'::text
);
select ok(
  (
    select pg_get_functiondef(function_record.oid)
      like '%room:%room-surfaces-changed%'
    from pg_proc as function_record
    join pg_namespace as function_schema
      on function_schema.oid = function_record.pronamespace
    where function_schema.nspname = 'public'
      and function_record.proname = 'broadcast_room_surface_change'
  ),
  'surface invalidation targets the existing private Room topic'::text
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '16000000-0000-4000-8000-000000000001',
  'authenticated',
  'authenticated',
  'surface-owner@example.com',
  '',
  now(),
  '{}',
  '{}',
  now(),
  now()
);

insert into public.workspaces (id, name, created_by)
values (
  '26000000-0000-4000-8000-000000000001',
  'Surface Workspace',
  '16000000-0000-4000-8000-000000000001'
);

insert into public.projects (id, workspace_id, name, created_by)
values (
  '76000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  'Surface Project',
  '16000000-0000-4000-8000-000000000001'
);

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  '46000000-0000-4000-8000-000000000001',
  '26000000-0000-4000-8000-000000000001',
  '76000000-0000-4000-8000-000000000001',
  'Surface Room',
  '16000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-4000-8000-000000000001',
  true
);

insert into public.decisions (id, room_id, summary, created_by)
values (
  '86000000-0000-4000-8000-000000000001',
  '46000000-0000-4000-8000-000000000001',
  'Ship the smaller scope',
  auth.uid()
);

reset role;

select is(
  (
    select count(*)::int
    from realtime.messages
    where topic = 'room:46000000-0000-4000-8000-000000000001'
      and event = 'room-surfaces-changed'
  ),
  1,
  'a decision insert invalidates only its Room topic'::text
);
select is(
  (
    select count(*)::int
    from realtime.messages
    where topic <> 'room:46000000-0000-4000-8000-000000000001'
      and event = 'room-surfaces-changed'
  ),
  0,
  'surface invalidation does not leak to another Room topic'::text
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-4000-8000-000000000001',
  true
);

delete from public.decisions
where id = '86000000-0000-4000-8000-000000000001';

reset role;

select is(
  (
    select count(*)::int
    from realtime.messages
    where topic = 'room:46000000-0000-4000-8000-000000000001'
      and event = 'room-surfaces-changed'
  ),
  2,
  'deleting the last decision broadcasts fallback invalidation'::text
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '16000000-0000-4000-8000-000000000001',
  true
);

select public.start_user_flow(
  '46000000-0000-4000-8000-000000000001'
);

reset role;

select is(
  (
    select count(*)::int
    from realtime.messages
    where topic = 'room:46000000-0000-4000-8000-000000000001'
      and event = 'room-surfaces-changed'
  ),
  3,
  'starting a user flow broadcasts through the same Room topic'::text
);

select * from finish();
rollback;
