begin;

create extension if not exists pgtap with schema extensions;

select plan(33);

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
  ),
  -- Revoked a day ago, not "now": now() is constant for the whole test
  -- transaction, so a device revoked inside it could not tell
  -- coalesce(revoked_at, now()) apart from a plain now().
  (
    '30000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    'Long Revoked Mac', 'macos', repeat('6', 64), 'revoked',
    now() - interval '1 day'
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

-- Owner's saved default points at their current Mac, and that Mac has a live
-- setup request. Re-pairing (redeeming a new code below) must revoke the Mac,
-- cancel the request, and clear the default so settle can refill it.
insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  'codex'
);

insert into public.provider_setup_requests (
  user_id, device_id, provider, status
)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000002',
  'codex', 'queued'
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

-- Three of the four fixture devices belong to the caller; device 1 does not.
select is(
  (select count(*) from public.list_execution_devices()),
  1::bigint,
  'list_execution_devices returns only the caller''s active devices'
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

select is(
  (
    select count(*) from public.list_execution_devices()
    where status = 'revoked'
  ),
  0::bigint,
  'reloading the device list cannot resurrect revoked devices'
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

-- Redemption is public only through the rate-limited web route. The route
-- holds this service-role capability on the server; browsers do not.

set local role service_role;

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

-- Redeeming that very same code again must fail: without the write-back
-- marking it spent, every code would be infinitely reusable and each
-- replay would mint another device on the owner's account.
select throws_ok(
  $$
    select public.redeem_device_pairing_code(
      repeat('9', 64), '30000000-0000-4000-8000-000000000094',
      repeat('7', 64), 'darwin', 'Replay Mac'
    )
  $$,
  'P0001', 'invalid_pairing_code',
  'a code cannot be redeemed a second time'
);

-- anon has no direct privileges on either table, so inspect the result as
-- the table owner.
reset role;

select is(
  (
    select redeemed_device_id from public.device_pairing_codes
    where code_hash = repeat('9', 64)
  ),
  '30000000-0000-4000-8000-000000000004'::uuid,
  'redemption records which device the spent code produced'
);

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

select is(
  (
    select status from public.execution_devices
    where id = '30000000-0000-4000-8000-000000000002'
  ),
  'revoked'::public.execution_device_status,
  're-pairing revokes the owner''s previous active device'
);

select ok(
  (
    select revoked_at is not null from public.execution_devices
    where id = '30000000-0000-4000-8000-000000000002'
  ),
  'the replaced device gets a revoked_at timestamp'
);

select is(
  (
    select default_device_id from public.ai_user_preferences
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  null::uuid,
  're-pairing clears the stale default so settle can refill it'
);

select is(
  (
    select status from public.provider_setup_requests
    where device_id = '30000000-0000-4000-8000-000000000002'
      and provider = 'codex'
  ),
  'cancelled'::public.provider_setup_status,
  're-pairing cancels the replaced device''s open setup request'
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
  'anon', array[]::name[],
  'anon cannot bypass route redemption limits'
);

select function_privs_are(
  'public', 'redeem_device_pairing_code',
  array['text', 'uuid', 'text', 'text', 'text'],
  'service_role', array['EXECUTE'],
  'only the server role may execute redemption'
);

select function_privs_are(
  'public', 'create_device_pairing_code',
  array['text', 'public.ai_provider'],
  'anon', array[]::name[],
  'anon may execute nothing else'
);

-- Not just insert/update/delete: revoking only those would leave these
-- roles holding TRUNCATE, REFERENCES and TRIGGER on a table of bearer
-- secrets, so assert they hold nothing whatsoever.
select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as table_entry
    cross join lateral aclexplode(
      coalesce(
        table_entry.relacl,
        acldefault('r', table_entry.relowner)
      )
    ) as privilege
    where table_entry.oid = 'public.device_pairing_codes'::regclass
      and privilege.grantee in (
        'anon'::regrole, 'authenticated'::regrole, 'service_role'::regrole
      )
  ),
  'anon, authenticated and service_role hold no privilege at all on '
    || 'device_pairing_codes'
);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_class as table_entry
    cross join lateral aclexplode(
      coalesce(
        table_entry.relacl,
        acldefault('r', table_entry.relowner)
      )
    ) as privilege
    where table_entry.oid = 'public.device_pairing_codes'::regclass
      and privilege.grantee = 0
  ),
  'PUBLIC holds no privilege on device_pairing_codes'
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
    )
  $$,
  'a user may revoke their own device'
);

-- Device 5 was revoked a day before this transaction started, so a plain
-- now() in place of coalesce(revoked_at, now()) would visibly move it.
select lives_ok(
  $$
    select public.revoke_execution_device(
      '30000000-0000-4000-8000-000000000005'
    )
  $$,
  'revocation is idempotent'
);

reset role;

select is(
  (
    select revoked_at from public.execution_devices
    where id = '30000000-0000-4000-8000-000000000005'
  ),
  now() - interval '1 day',
  'a repeated revocation preserves the original revoked_at timestamp'
);

select * from finish();
rollback;
