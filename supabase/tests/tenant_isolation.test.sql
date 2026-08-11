begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (
  id,
  aud,
  role,
  email,
  encrypted_password,
  email_confirmed_at,
  raw_app_meta_data,
  raw_user_meta_data,
  created_at,
  updated_at
)
values
  (
    '10000000-0000-0000-0000-000000000001',
    'authenticated',
    'authenticated',
    'owner-a@example.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '20000000-0000-0000-0000-000000000002',
    'authenticated',
    'authenticated',
    'member-b@example.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

insert into public.workspaces (id, name, created_by)
values (
  '30000000-0000-0000-0000-000000000003',
  'Org A',
  auth.uid()
);

select is(
  (
    select role::text
    from public.memberships
    where workspace_id = '30000000-0000-0000-0000-000000000003'
      and user_id = auth.uid()
  ),
  'admin',
  'workspace creator is bootstrapped as an admin'
);

select is(
  (select count(*)::int from public.workspaces),
  1,
  'owner sees their workspace'
);

select lives_ok(
  $$
    insert into public.projects (id, workspace_id, name)
    values (
      '40000000-0000-0000-0000-000000000004',
      '30000000-0000-0000-0000-000000000003',
      'Product A'
    )
  $$,
  'workspace admin can create a product'
);

select lives_ok(
  $$
    insert into public.memberships (workspace_id, user_id, role)
    values (
      '30000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000002',
      'member'
    )
  $$,
  'workspace admin can add a member'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);

select is(
  (select count(*)::int from public.workspaces),
  1,
  'member sees their workspace'
);

select is(
  (select count(*)::int from public.projects),
  1,
  'member sees projects in their workspace'
);

select is_empty(
  $$
    update public.workspaces
    set name = 'Member takeover'
    where id = '30000000-0000-0000-0000-000000000003'
    returning 1
  $$,
  'non-admin member cannot update the workspace'
);

select is_empty(
  $$
    update public.memberships
    set role = 'member'
    where workspace_id = '30000000-0000-0000-0000-000000000003'
      and user_id = '10000000-0000-0000-0000-000000000001'
    returning 1
  $$,
  'non-admin member cannot update memberships'
);

select is(
  (
    select role::text
    from public.memberships
    where workspace_id = '30000000-0000-0000-0000-000000000003'
      and user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'admin',
  'denied membership update leaves the admin role unchanged'
);

select throws_ok(
  $$
    insert into public.projects (workspace_id, name)
    values (
      '30000000-0000-0000-0000-000000000003',
      'Unauthorized product'
    )
  $$,
  '42501',
  null,
  'non-admin member cannot create projects'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

delete from public.memberships
where workspace_id = '30000000-0000-0000-0000-000000000003'
  and user_id = '20000000-0000-0000-0000-000000000002';

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);

select is(
  (select count(*)::int from public.workspaces),
  0,
  'unrelated user cannot see the workspace'
);

select is(
  (select count(*)::int from public.projects),
  0,
  'unrelated user cannot see tenant projects'
);

select is_empty(
  $$
    update public.workspaces
    set name = 'Stolen'
    where id = '30000000-0000-0000-0000-000000000003'
    returning 1
  $$,
  'unrelated user cannot update the workspace'
);

select throws_ok(
  $$
    insert into public.projects (workspace_id, name)
    values (
      '30000000-0000-0000-0000-000000000003',
      'Cross-tenant product'
    )
  $$,
  '42501',
  null,
  'unrelated user cannot write into tenant projects'
);

select * from finish();
rollback;
