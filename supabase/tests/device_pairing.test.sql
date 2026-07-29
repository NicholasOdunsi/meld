begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'pairing-owner@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'other-user@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status, revoked_at
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    'Other Mac', 'macos', repeat('1', 64), 'active', null
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'Owner Mac', 'macos', repeat('2', 64), 'active', null
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'Revoked Mac', 'macos', repeat('3', 64), 'revoked', now()
  );

insert into public.provider_connections (
  user_id, device_id, provider, installation, version,
  authentication, compatibility, last_seen_at
)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  'codex', 'installed', '1.0.0', 'authenticated', 'supported', now()
);

-- create_device_pairing_code, as the signed-in owner

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$ select public.create_device_pairing_code(repeat('5', 64), 'codex') $$,
  'a signed-in user may create a pairing code'
);

-- device_pairing_codes has zero direct privileges for any role (not even
-- SELECT), so reading it back requires the table owner.
reset role;

select is(
  (
    select user_id from public.device_pairing_codes
    where code_hash = repeat('5', 64)
  ),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'the code belongs to auth.uid(), not to any supplied value'
);

select ok(
  (
    select expires_at from public.device_pairing_codes
    where code_hash = repeat('5', 64)
  ) between now() + interval '9 minutes' and now() + interval '10 minutes',
  'codes expire ten minutes after creation'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

-- Fill out the remaining live-code quota quietly.
select public.create_device_pairing_code(repeat('6', 64), 'codex');
select public.create_device_pairing_code(repeat('7', 64), 'codex');
select public.create_device_pairing_code(repeat('8', 64), 'codex');
select public.create_device_pairing_code(repeat('9', 64), 'codex');

select throws_ok(
  $$ select public.create_device_pairing_code(repeat('0', 64), 'codex') $$,
  'P0001', 'too_many_pairing_codes',
  'a sixth live code is refused'
);

select is(
  (select count(*) from public.list_execution_devices()),
  2::bigint,
  'list_execution_devices returns only the caller''s devices'
);

select is(
  (
    select count(*) from public.list_execution_devices()
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  0::bigint,
  'list_execution_devices excludes another user''s device'
);

select ok(
  (
    select
      jsonb_array_length(providers) = 1
      and providers -> 0 ->> 'provider' = 'codex'
    from public.list_execution_devices()
    where id = '30000000-0000-4000-8000-000000000002'
  ),
  'list_execution_devices aggregates the device''s provider connections'
);

select throws_ok(
  $$
    insert into public.device_pairing_codes (
      user_id, code_hash, requested_provider, expires_at
    )
    values (
      auth.uid(), repeat('d', 64), 'codex', now() + interval '10 minutes'
    )
  $$,
  '42501', null,
  'authenticated cannot insert pairing codes directly'
);

-- Fixtures for redemption: an expired code and an already-redeemed code,
-- inserted directly as the table owner since every role's write access is
-- revoked.
reset role;

insert into public.device_pairing_codes (
  user_id, code_hash, requested_provider, expires_at
)
values (
  '10000000-0000-4000-8000-000000000001',
  repeat('a', 64), 'codex', now() - interval '1 minute'
);

insert into public.device_pairing_codes (
  user_id, code_hash, requested_provider, expires_at,
  redeemed_at, redeemed_device_id
)
values (
  '10000000-0000-4000-8000-000000000001',
  repeat('b', 64), 'codex', now() + interval '10 minutes',
  now(), '30000000-0000-4000-8000-000000000002'
);

-- redeem_device_pairing_code, from anon: the connector has no session.

set local role anon;

select throws_ok(
  $$
    select public.redeem_device_pairing_code(
      repeat('c', 64), '30000000-0000-4000-8000-000000000091',
      repeat('e', 64), 'darwin', 'Mac'
    )
  $$,
  'P0001', 'invalid_pairing_code', 'an unknown code is refused'
);

select throws_ok(
  $$
    select public.redeem_device_pairing_code(
      repeat('a', 64), '30000000-0000-4000-8000-000000000092',
      repeat('e', 64), 'darwin', 'Mac'
    )
  $$,
  'P0001', 'invalid_pairing_code', 'an expired code is refused'
);

select throws_ok(
  $$
    select public.redeem_device_pairing_code(
      repeat('b', 64), '30000000-0000-4000-8000-000000000093',
      repeat('e', 64), 'darwin', 'Mac'
    )
  $$,
  'P0001', 'invalid_pairing_code', 'an already-redeemed code is refused'
);

select lives_ok(
  $$
    select public.redeem_device_pairing_code(
      repeat('9', 64), '30000000-0000-4000-8000-000000000004',
      repeat('4', 64), 'darwin', 'Paired Mac'
    )
  $$,
  'a live code is redeemed by the anonymous connector'
);

-- anon has no direct privileges on either table, so inspect the result as
-- the table owner.
reset role;

select is(
  (
    select count(*) from public.execution_devices
    where id = '30000000-0000-4000-8000-000000000004'
  ),
  1::bigint,
  'redemption creates the device row'
);

select is(
  (
    select user_id from public.execution_devices
    where id = '30000000-0000-4000-8000-000000000004'
  ),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'the device belongs to the code owner, not the anonymous caller'
);

select is(
  (
    select count(*) from public.provider_connections
    where device_id = '30000000-0000-4000-8000-000000000004'
  ),
  0::bigint,
  'redemption creates no provider connection'
);

-- privileges, and record_device_connection's new reporting behaviour

reset role;
set local role service_role;

select throws_ok(
  $$
    insert into public.device_pairing_codes (
      user_id, code_hash, requested_provider, expires_at
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      repeat('f', 64), 'codex', now() + interval '10 minutes'
    )
  $$,
  '42501', null,
  'service_role cannot insert pairing codes directly'
);

select is(
  public.record_device_connection(
    '30000000-0000-4000-8000-000000000003', 'v1'
  ),
  'revoked'::public.execution_device_status,
  'a revoked device reports its status instead of raising'
);

reset role;

select function_privs_are(
  'public', 'redeem_device_pairing_code',
  array['text', 'uuid', 'text', 'text', 'text'],
  'anon', array['EXECUTE'],
  'anon may execute redemption'
);

select function_privs_are(
  'public', 'create_device_pairing_code',
  array['text', 'public.ai_provider'],
  'anon', array[]::name[],
  'anon may execute nothing else'
);

-- revoke_execution_device

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$
    select public.revoke_execution_device(
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001', 'invalid_execution_device',
  'a user cannot revoke another user''s device'
);

select lives_ok(
  $$
    select public.revoke_execution_device(
      '30000000-0000-4000-8000-000000000002'
    );
    select public.revoke_execution_device(
      '30000000-0000-4000-8000-000000000002'
    );
  $$,
  'revocation is idempotent'
);

select * from finish();
rollback;
