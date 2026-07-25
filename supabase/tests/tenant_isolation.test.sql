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

insert into public.organizations (id, name, created_by)
values (
  '30000000-0000-0000-0000-000000000003',
  'Org A',
  auth.uid()
);

select is(
  (
    select role::text
    from public.memberships
    where organization_id = '30000000-0000-0000-0000-000000000003'
      and user_id = auth.uid()
  ),
  'admin',
  'organization creator is bootstrapped as an admin'
);

select is(
  (select count(*)::int from public.organizations),
  1,
  'owner sees their organization'
);

select lives_ok(
  $$
    insert into public.products (id, organization_id, name)
    values (
      '40000000-0000-0000-0000-000000000004',
      '30000000-0000-0000-0000-000000000003',
      'Product A'
    )
  $$,
  'organization admin can create a product'
);

select lives_ok(
  $$
    insert into public.memberships (organization_id, user_id, role)
    values (
      '30000000-0000-0000-0000-000000000003',
      '20000000-0000-0000-0000-000000000002',
      'member'
    )
  $$,
  'organization admin can add a member'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);

select is(
  (select count(*)::int from public.organizations),
  1,
  'member sees their organization'
);

select is(
  (select count(*)::int from public.products),
  1,
  'member sees products in their organization'
);

select is(
  (
    with updated as (
      update public.organizations
      set name = 'Member takeover'
      where id = '30000000-0000-0000-0000-000000000003'
      returning 1
    )
    select count(*)::int from updated
  ),
  0,
  'non-admin member cannot update the organization'
);

select is(
  (
    with updated as (
      update public.memberships
      set role = 'member'
      where organization_id = '30000000-0000-0000-0000-000000000003'
        and user_id = '10000000-0000-0000-0000-000000000001'
      returning 1
    )
    select count(*)::int from updated
  ),
  0,
  'non-admin member cannot update memberships'
);

select is(
  (
    select role::text
    from public.memberships
    where organization_id = '30000000-0000-0000-0000-000000000003'
      and user_id = '10000000-0000-0000-0000-000000000001'
  ),
  'admin',
  'denied membership update leaves the admin role unchanged'
);

select throws_ok(
  $$
    insert into public.products (organization_id, name)
    values (
      '30000000-0000-0000-0000-000000000003',
      'Unauthorized product'
    )
  $$,
  '42501',
  null,
  'non-admin member cannot create products'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-0000-0000-000000000001',
  true
);

delete from public.memberships
where organization_id = '30000000-0000-0000-0000-000000000003'
  and user_id = '20000000-0000-0000-0000-000000000002';

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-0000-0000-000000000002',
  true
);

select is(
  (select count(*)::int from public.organizations),
  0,
  'unrelated user cannot see the organization'
);

select is(
  (select count(*)::int from public.products),
  0,
  'unrelated user cannot see tenant products'
);

select is(
  (
    with updated as (
      update public.organizations
      set name = 'Stolen'
      where id = '30000000-0000-0000-0000-000000000003'
      returning 1
    )
    select count(*)::int from updated
  ),
  0,
  'unrelated user cannot update the organization'
);

select throws_ok(
  $$
    insert into public.products (organization_id, name)
    values (
      '30000000-0000-0000-0000-000000000003',
      'Cross-tenant product'
    )
  $$,
  '42501',
  null,
  'unrelated user cannot write into tenant products'
);

select * from finish();
rollback;
