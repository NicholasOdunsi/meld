begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

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
    '10000000-0000-4000-8000-000000000001',
    'authenticated',
    'authenticated',
    'owner@example.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{"full_name":"Owner Example"}',
    now(),
    now()
  ),
  (
    '20000000-0000-4000-8000-000000000002',
    'authenticated',
    'authenticated',
    'member@example.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    'authenticated',
    'authenticated',
    'invitee@example.com',
    '',
    now(),
    '{"provider":"email","providers":["email"]}',
    '{}',
    now(),
    now()
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    'authenticated',
    'authenticated',
    'wrong@example.com',
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
  '10000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$
    select public.create_organization_with_product(
      'Northstar',
      'Mobile app'
    )
  $$,
  'organization onboarding RPC succeeds'
);

select is(
  (select count(*)::int from public.organizations),
  1,
  'onboarding creates one organization'
);

select is(
  (select count(*)::int from public.memberships),
  1,
  'onboarding atomically creates the admin membership'
);

select is(
  (select count(*)::int from public.products),
  1,
  'onboarding atomically creates the default product'
);

insert into public.memberships (organization_id, user_id, role)
select
  organization.id,
  '20000000-0000-4000-8000-000000000002',
  'member'
from public.organizations as organization;

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $$
    select public.create_invitation(
      (select id from public.organizations limit 1),
      'invitee@example.com',
      '50000000-0000-4000-8000-000000000005',
      repeat('a', 64)
    )
  $$,
  'P0001',
  null,
  'non-admin members cannot create invitations'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$
    select public.create_invitation(
      (select id from public.organizations limit 1),
      ' Invitee@Example.COM ',
      '50000000-0000-4000-8000-000000000005',
      encode(
        extensions.digest(
          convert_to(
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    )
  $$,
  'admins can create durable invitations'
);

select is(
  (
    select email
    from public.invitations
    where id = '50000000-0000-4000-8000-000000000005'
  ),
  'invitee@example.com',
  'invitation email is normalized'
);

select is(
  (
    select octet_length(token_hash)
    from public.invitations
    where id = '50000000-0000-4000-8000-000000000005'
  ),
  32,
  'only a 32-byte SHA-256 token hash is stored'
);

select isnt(
  (
    select encode(token_hash, 'hex')
    from public.invitations
    where id = '50000000-0000-4000-8000-000000000005'
  ),
  'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
  'raw invitation token is not persisted'
);

select set_config(
  'request.jwt.claim.sub',
  '20000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $$
    select public.authorize_invitation_delivery(
      (select id from public.organizations limit 1),
      '50000000-0000-4000-8000-000000000005',
      encode(
        extensions.digest(
          convert_to(
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    )
  $$,
  'P0001',
  null,
  'non-admin members cannot authorize invitation retry'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$
    select public.authorize_invitation_delivery(
      (select id from public.organizations limit 1),
      '50000000-0000-4000-8000-000000000005',
      repeat('f', 64)
    )
  $$,
  'P0001',
  null,
  'retry rejects a reconstructed token hash mismatch'
);

select lives_ok(
  $$
    select public.authorize_invitation_delivery(
      (select id from public.organizations limit 1),
      '50000000-0000-4000-8000-000000000005',
      encode(
        extensions.digest(
          convert_to(
            'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA',
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    )
  $$,
  'admin retry accepts the verified token hash'
);

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000004',
  true
);

select throws_ok(
  $$
    select public.accept_invitation(
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    )
  $$,
  'P0001',
  null,
  'wrong authenticated email cannot accept an invitation'
);

select set_config(
  'request.jwt.claim.sub',
  '30000000-0000-4000-8000-000000000003',
  true
);

select lives_ok(
  $$
    select public.accept_invitation(
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    )
  $$,
  'matching authenticated invitee can accept'
);

select is(
  (
    select count(*)::int
    from public.memberships
    where user_id = '30000000-0000-4000-8000-000000000003'
  ),
  1,
  'acceptance creates one member membership'
);

select throws_ok(
  $$
    select public.accept_invitation(
      'AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA'
    )
  $$,
  'P0001',
  null,
  'an accepted invitation cannot be reused'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$
    select public.create_invitation(
      (select id from public.organizations limit 1),
      'wrong@example.com',
      '60000000-0000-4000-8000-000000000006',
      encode(
        extensions.digest(
          convert_to(
            'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB',
            'UTF8'
          ),
          'sha256'
        ),
        'hex'
      )
    )
  $$,
  'admin can create a second invitation'
);

select lives_ok(
  $$
    select public.revoke_invitation(
      (select id from public.organizations limit 1),
      '60000000-0000-4000-8000-000000000006'
    )
  $$,
  'admin can explicitly revoke an invitation'
);

select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000004',
  true
);

select throws_ok(
  $$
    select public.accept_invitation(
      'BBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBBB'
    )
  $$,
  'P0001',
  null,
  'revoked invitations cannot be accepted'
);

reset role;

insert into public.invitations (
  id,
  organization_id,
  email,
  invited_by,
  token_hash,
  expires_at
)
select
  '70000000-0000-4000-8000-000000000007',
  organization.id,
  'wrong@example.com',
  '10000000-0000-4000-8000-000000000001',
  extensions.digest(
    convert_to(
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC',
      'UTF8'
    ),
    'sha256'
  ),
  now() - interval '1 second'
from public.organizations as organization;

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '40000000-0000-4000-8000-000000000004',
  true
);

select throws_ok(
  $$
    select public.accept_invitation(
      'CCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCCC'
    )
  $$,
  'P0001',
  null,
  'expired invitations cannot be accepted'
);

select * from finish();
rollback;
