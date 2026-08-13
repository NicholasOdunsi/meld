begin;

create extension if not exists pgtap with schema extensions;

select plan(19);

select has_table(
  'public'::name,
  'design_screens'::name,
  'design screens exist'::text
);
select has_table(
  'public'::name,
  'design_screen_versions'::name,
  'design screen versions exist'::text
);
select ok(
  not has_table_privilege(
    'authenticated',
    'public.design_screen_versions',
    'INSERT'
  ),
  'authenticated users cannot insert screen versions directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_design_screen(uuid, text, text, double precision, double precision)',
    'EXECUTE'
  ),
  'anonymous users cannot create screens'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.insert_and_promote_screen_version(uuid, text, text, text, jsonb, uuid, uuid, uuid, uuid)',
    'EXECUTE'
  ),
  'browser users cannot invoke the CAS materializer directly'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('83000000-0000-4000-8000-000000000001','authenticated','authenticated','screen-owner@example.com','',now(),'{}','{}',now(),now()),
  ('83000000-0000-4000-8000-000000000002','authenticated','authenticated','screen-viewer@example.com','',now(),'{}','{}',now(),now()),
  ('83000000-0000-4000-8000-000000000003','authenticated','authenticated','screen-outsider@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  '84000000-0000-4000-8000-000000000001',
  'Screen Workspace',
  '83000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  '85000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  'Screen Project',
  '83000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values (
  '84000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000002',
  'member'
);
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  '86000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  '85000000-0000-4000-8000-000000000001',
  'Screen Room',
  '83000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values (
  '86000000-0000-4000-8000-000000000001',
  '83000000-0000-4000-8000-000000000002',
  'view',
  '83000000-0000-4000-8000-000000000001'
);
insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  '87000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000001',
  '84000000-0000-4000-8000-000000000001',
  'Checkout',
  '83000000-0000-4000-8000-000000000001'
);
insert into public.design_screen_versions (
  id, screen_id, room_id, markup, styles, script, actions_json,
  promoted, created_by
)
values (
  '88000000-0000-4000-8000-000000000001',
  '87000000-0000-4000-8000-000000000001',
  '86000000-0000-4000-8000-000000000001',
  'V0', '', null, '[]', true,
  '83000000-0000-4000-8000-000000000001'
);
update public.design_screens
set current_version_id = '88000000-0000-4000-8000-000000000001',
    state = 'built'
where id = '87000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '83000000-0000-4000-8000-000000000003',
  true
);
select is(
  (select count(*)::integer from public.design_screens),
  0,
  'a non-participant cannot read screens'
);
select is(
  (select count(*)::integer from public.design_screen_versions),
  0,
  'a non-participant cannot read screen versions'
);

select set_config(
  'request.jwt.claim.sub',
  '83000000-0000-4000-8000-000000000002',
  true
);
select is(
  (select count(*)::integer from public.design_screens),
  1,
  'a participant can read screens'
);
select is(
  (select count(*)::integer from public.design_screen_versions),
  1,
  'a participant can read screen versions'
);

reset role;
select throws_ok(
  $$ update public.design_screen_versions set markup = 'mutated'
    where id = '88000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'design_screen_version_immutable',
  'screen version content cannot be updated'
);
select throws_ok(
  $$ update public.design_screen_versions set promoted = false
    where id = '88000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'design_screen_version_immutable',
  'a promoted screen version cannot be demoted'
);
select throws_ok(
  $$ delete from public.design_screen_versions
    where id = '88000000-0000-4000-8000-000000000001' $$,
  'P0001',
  'design_screen_version_immutable',
  'screen versions cannot be deleted'
);

select is(
  (
    public.insert_and_promote_screen_version(
      '87000000-0000-4000-8000-000000000001',
      'A', '', null, '[]',
      '88000000-0000-4000-8000-000000000001',
      null, null,
      '83000000-0000-4000-8000-000000000001'
    )
  ).promoted,
  true,
  'the first compare-and-swap promotes'
);
select is(
  (
    public.insert_and_promote_screen_version(
      '87000000-0000-4000-8000-000000000001',
      'B', '', null, '[]',
      '88000000-0000-4000-8000-000000000001',
      null, null,
      '83000000-0000-4000-8000-000000000001'
    )
  ).promoted,
  false,
  'a stale compare-and-swap returns without promotion'
);
select is(
  (
    select count(*)
    from public.design_screen_versions
    where screen_id = '87000000-0000-4000-8000-000000000001'
  ),
  3::bigint,
  'the losing version is retained as a stale candidate'
);
select is(
  (
    select current_version_id
    from public.design_screens
    where id = '87000000-0000-4000-8000-000000000001'
  ),
  (
    select id from public.design_screen_versions
    where markup = 'A'
  ),
  'the current pointer stays on the winner'
);
select is(
  (
    select promoted
    from public.design_screen_versions
    where markup = 'B'
  ),
  false,
  'the retained loser is marked unpromoted'
);
select is(
  (
    select state::text
    from public.design_screens
    where id = '87000000-0000-4000-8000-000000000001'
  ),
  'built',
  'a successful promotion marks the screen built'
);
select is(
  (
    select updating
    from public.design_screens
    where id = '87000000-0000-4000-8000-000000000001'
  ),
  false,
  'settled compare-and-swap clears the updating flag'
);

select * from finish();
rollback;
