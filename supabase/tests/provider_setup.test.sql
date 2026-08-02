begin;

create extension if not exists pgtap with schema extensions;

select plan(96);

-- Three users: U1 owns the create/dispatch/progress/settlement fixtures, U2
-- exists only to prove cross-user rejection and cross-user invisibility, and
-- U3 owns the preference and revocation fixtures. ai_user_preferences is
-- keyed by user_id alone, so the "first completion wins" assertion and the
-- "an explicit choice replaces the default" assertion cannot share an owner.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'setup-owner@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'setup-other@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000003', 'authenticated',
    'authenticated', 'setup-preference@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  -- U4 owns nothing else: redeeming a pairing code revokes the redeemer's other
  -- active devices (single-Mac replace-on-pair), so the "redemption seeds a
  -- setup request" check must run as a user whose device fleet we don't rely on.
  (
    '10000000-0000-4000-8000-000000000004', 'authenticated',
    'authenticated', 'setup-newuser@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status, revoked_at
)
values
  -- D_A: the device create_provider_setup_request is exercised against.
  (
    '30000000-0000-4000-8000-00000000000a',
    '10000000-0000-4000-8000-000000000001',
    'Owner Mac A', 'macos', repeat('a', 64), 'active', null
  ),
  -- D_B: belongs to U2.
  (
    '30000000-0000-4000-8000-00000000000b',
    '10000000-0000-4000-8000-000000000002',
    'Other Mac B', 'macos', repeat('b', 64), 'active', null
  ),
  -- D_C: revoked, so neither requestable nor dispatchable.
  (
    '30000000-0000-4000-8000-00000000000c',
    '10000000-0000-4000-8000-000000000001',
    'Revoked Mac C', 'macos', repeat('c', 64), 'revoked',
    now() - interval '1 day'
  ),
  -- D_D: progress transitions.
  (
    '30000000-0000-4000-8000-00000000000d',
    '10000000-0000-4000-8000-000000000001',
    'Owner Mac D', 'macos', repeat('d', 64), 'active', null
  ),
  -- D_E: successful settlement, and U1's first default.
  (
    '30000000-0000-4000-8000-00000000000e',
    '10000000-0000-4000-8000-000000000001',
    'Owner Mac E', 'macos', repeat('e', 64), 'active', null
  ),
  -- D_F: failing settlement.
  (
    '30000000-0000-4000-8000-00000000000f',
    '10000000-0000-4000-8000-000000000001',
    'Owner Mac F', 'macos', repeat('f', 64), 'active', null
  ),
  -- D_G: cancelled settlement and the missing-error-code rejection.
  (
    '30000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    'Owner Mac G', 'macos', repeat('1', 64), 'active', null
  ),
  -- D_H: a second successful settlement that must not steal the default.
  (
    '30000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000001',
    'Owner Mac H', 'macos', repeat('2', 64), 'active', null
  ),
  -- D_I: U3's first preference target.
  (
    '30000000-0000-4000-8000-000000000012',
    '10000000-0000-4000-8000-000000000003',
    'Preference Mac I', 'macos', repeat('3', 64), 'active', null
  ),
  -- D_K: U3's replacement preference target, later revoked.
  (
    '30000000-0000-4000-8000-000000000013',
    '10000000-0000-4000-8000-000000000003',
    'Preference Mac K', 'macos', repeat('4', 64), 'active', null
  );

insert into public.provider_connections (
  user_id, device_id, provider, installation, version,
  authentication, compatibility, last_seen_at
)
values
  -- Ready: eligible to become a default.
  (
    '10000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000012',
    'codex', 'installed', '1.0.0', 'authenticated', 'supported', now()
  ),
  -- Installed but signed out: must not be storable as a default.
  (
    '10000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000012',
    'claude', 'installed', '1.0.0', 'signed_out', 'supported', now()
  ),
  (
    '10000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000013',
    'codex', 'installed', '1.0.0', 'authenticated', 'supported', now()
  );

-- Requests that need a specific starting status are inserted as the table
-- owner: every role's write access to provider_setup_requests is revoked, and
-- the RPCs deliberately offer no way to start a request mid-flight.
insert into public.provider_setup_requests (
  id, user_id, device_id, provider, status
)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-00000000000d', 'codex', 'dispatched'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-00000000000e', 'codex', 'verifying'
  ),
  (
    '40000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-00000000000f', 'codex', 'verifying'
  ),
  (
    '40000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000010', 'codex', 'verifying'
  ),
  (
    '40000000-0000-4000-8000-000000000005',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000011', 'claude', 'verifying'
  ),
  (
    '40000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-00000000000c', 'codex', 'queued'
  ),
  (
    '40000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000013', 'claude', 'queued'
  ),
  (
    '40000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-00000000000b', 'codex', 'queued'
  );

insert into public.provider_setup_requests (
  id, user_id, device_id, provider, status, completed_at
)
values (
  '40000000-0000-4000-8000-000000000009',
  '10000000-0000-4000-8000-000000000003',
  '30000000-0000-4000-8000-000000000013', 'codex', 'completed',
  now() - interval '1 hour'
);

-- Structure --------------------------------------------------------------

-- The ::name casts are load-bearing. pgTAP overloads these on argument type,
-- not arity: has_table(NAME, TEXT) is (table, description) while
-- has_table(NAME, NAME) is (schema, table). Two bare literals resolve to the
-- first, so has_table('public', 'provider_setup_requests') silently asserts
-- that a table literally named "public" exists and can never pass. has_index
-- is the same trap: (NAME, NAME, NAME) is (schema, table, index), but three
-- bare literals resolve to (table, index, column).
select has_table('public'::name, 'provider_setup_requests'::name);
select has_table('public'::name, 'ai_user_preferences'::name);
select has_function(
  'public',
  'create_provider_setup_request',
  array['uuid', 'ai_provider']
);
select has_function(
  'public',
  'list_dispatchable_provider_setups',
  array['uuid[]']
);
select has_function(
  'public',
  'record_provider_setup_progress',
  array['uuid', 'uuid', 'provider_setup_stage', 'text']
);
select has_function(
  'public',
  'settle_provider_setup_request',
  array['uuid', 'uuid', 'boolean', 'jsonb', 'provider_setup_error_code', 'text']
);
select has_function(
  'public',
  'set_ai_user_preference',
  array['uuid', 'ai_provider']
);
select has_index(
  'public'::name,
  'provider_setup_requests'::name,
  'provider_setup_one_active'::name
);

-- Pairing redemption seeds the setup request -----------------------------
-- Runs as U4 (a fresh user with no other devices): replace-on-pair revokes the
-- redeemer's prior active devices, which would otherwise wipe U1's fixture fleet.

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000004',
  true
);

select public.create_device_pairing_code(repeat('9', 64), 'claude');

reset role;
set local role service_role;

select public.redeem_device_pairing_code(
  repeat('9', 64), '30000000-0000-4000-8000-000000000020',
  repeat('5', 64), 'darwin', 'Paired Mac'
);

reset role;

select is(
  (
    select count(*) from public.provider_setup_requests
    where device_id = '30000000-0000-4000-8000-000000000020'
  ),
  1::bigint,
  'pairing redemption creates exactly one setup request for the new device'
);

select is(
  (
    select status::text || '/' || provider::text
    from public.provider_setup_requests
    where device_id = '30000000-0000-4000-8000-000000000020'
  ),
  'queued/claude',
  'the seeded request is queued for the provider the code asked for'
);

-- create_provider_setup_request -----------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$
    select public.create_provider_setup_request(
      '30000000-0000-4000-8000-00000000000a', 'codex'
    )
  $$,
  'a signed-in user may request setup on their own active device'
);

select is(
  (
    select public.create_provider_setup_request(
      '30000000-0000-4000-8000-00000000000a', 'codex'
    ) ->> 'id'
  ),
  (
    select id::text from public.provider_setup_requests
    where device_id = '30000000-0000-4000-8000-00000000000a'
  ),
  'a repeated request for the same active device and provider returns the '
    || 'existing request id'
);

select is(
  (
    select count(*) from public.provider_setup_requests
    where device_id = '30000000-0000-4000-8000-00000000000a'
  ),
  1::bigint,
  'a repeated request creates no second row'
);

-- The returned JSON is a wire contract, not a convenience: the web app parses
-- these exact camelCase keys with a Zod schema, so a typo in one of them
-- would pass every assertion that only reads ->> 'id' and surface much later
-- as an unexplained parse failure. ?& proves each key is present (a key whose
-- value is JSON null still counts) and the count makes the set exact, so a
-- renamed key fails as both a missing name and a wrong size.
with document as (
  select public.create_provider_setup_request(
    '30000000-0000-4000-8000-00000000000a', 'codex'
  ) as payload
)
select ok(
  payload ?& array[
    'id', 'userId', 'deviceId', 'provider', 'status', 'stage',
    'progressMessage', 'errorCode', 'errorMessage', 'createdAt',
    'updatedAt', 'completedAt'
  ]
    and (select count(*) from jsonb_object_keys(payload)) = 12,
  'create_provider_setup_request returns exactly its camelCase key set'
)
from document;

with document as (
  select public.create_provider_setup_request(
    '30000000-0000-4000-8000-00000000000a', 'codex'
  ) as payload
)
select is(
  payload ->> 'deviceId' || '/' || (payload ->> 'provider')
    || '/' || (payload ->> 'status') || '/' || (payload ->> 'userId'),
  '30000000-0000-4000-8000-00000000000a/codex/queued/'
    || '10000000-0000-4000-8000-000000000001',
  'create_provider_setup_request maps each camelCase key to its own column'
)
from document;

select throws_ok(
  $$
    select public.create_provider_setup_request(
      '30000000-0000-4000-8000-00000000000c', 'codex'
    )
  $$,
  'P0001', 'invalid_provider_setup_request',
  'a revoked device cannot be set up'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $$
    select public.create_provider_setup_request(
      '30000000-0000-4000-8000-00000000000a', 'codex'
    )
  $$,
  'P0001', 'invalid_provider_setup_request',
  'another user cannot target a device they do not own'
);

-- list_dispatchable_provider_setups --------------------------------------

reset role;
set local role service_role;

select is(
  (
    select count(*)
    from public.list_dispatchable_provider_setups(
      array['30000000-0000-4000-8000-00000000000a'::uuid]
    )
  ),
  1::bigint,
  'a queued request for a connected active device is dispatchable'
);

reset role;

select is(
  (
    select status::text from public.provider_setup_requests
    where device_id = '30000000-0000-4000-8000-00000000000a'
  ),
  'dispatched',
  'dispatch moves a queued request to dispatched in the same transaction'
);

set local role service_role;

select is(
  (
    select count(*)
    from public.list_dispatchable_provider_setups(
      array['30000000-0000-4000-8000-00000000000e'::uuid]
    )
  ),
  1::bigint,
  'a nonterminal request past dispatch is redispatched on reconnect'
);

reset role;

select is(
  (
    select status::text from public.provider_setup_requests
    where id = '40000000-0000-4000-8000-000000000002'
  ),
  'verifying',
  'redispatch does not rewind a later stage back to dispatched'
);

set local role service_role;

select is(
  (
    select count(*)
    from public.list_dispatchable_provider_setups(
      array['30000000-0000-4000-8000-00000000000c'::uuid]
    )
  ),
  0::bigint,
  'a revoked device is never dispatchable'
);

reset role;

select is(
  (
    select status::text from public.provider_setup_requests
    where id = '40000000-0000-4000-8000-000000000006'
  ),
  'queued',
  'a revoked device''s request is left untouched rather than dispatched'
);

set local role service_role;

select is(
  (
    select count(*)
    from public.list_dispatchable_provider_setups(array[]::uuid[])
  ),
  0::bigint,
  'no connected devices dispatch nothing'
);

select is(
  (
    select count(*)
    from public.list_dispatchable_provider_setups(null)
  ),
  0::bigint,
  'a null connected-device list dispatches nothing'
);

reset role;

select function_privs_are(
  'public', 'list_dispatchable_provider_setups', array['uuid[]'],
  'service_role', array['EXECUTE'],
  'only the gateway role may enumerate dispatchable setups'
);

select function_privs_are(
  'public', 'list_dispatchable_provider_setups', array['uuid[]'],
  'authenticated', array[]::name[],
  'a signed-in user cannot enumerate dispatchable setups'
);

select function_privs_are(
  'public', 'list_dispatchable_provider_setups', array['uuid[]'],
  'anon', array[]::name[],
  'anon cannot enumerate dispatchable setups'
);

-- record_provider_setup_progress ----------------------------------------

set local role service_role;

select throws_ok(
  $$
    select public.record_provider_setup_progress(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-00000000000e',
      'installing', null
    )
  $$,
  'P0001', 'invalid_provider_setup_progress',
  'progress requires the device the request was assigned to'
);

select is(
  public.record_provider_setup_progress(
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-00000000000d',
    'installing', 'Installing the runtime'
  ),
  'installing'::public.provider_setup_status,
  'dispatched advances to installing'
);

reset role;

select is(
  (
    select status::text || '/' || stage::text
    from public.provider_setup_requests
    where id = '40000000-0000-4000-8000-000000000001'
  ),
  'installing/installing',
  'progress moves status and stage in lockstep'
);

select is(
  (
    select progress_message from public.provider_setup_requests
    where id = '40000000-0000-4000-8000-000000000001'
  ),
  'Installing the runtime',
  'progress records the reported message'
);

set local role service_role;

select throws_ok(
  $$
    select public.record_provider_setup_progress(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-00000000000d',
      'verifying', null
    )
  $$,
  'P0001', 'invalid_provider_setup_progress',
  'skipping a stage is refused'
);

select is(
  public.record_provider_setup_progress(
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-00000000000d',
    'installing', 'Installing the runtime'
  ),
  'installing'::public.provider_setup_status,
  'repeated identical progress is an idempotent success'
);

select is(
  public.record_provider_setup_progress(
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-00000000000d',
    'authenticating', 'Waiting for sign-in'
  ),
  'authenticating'::public.provider_setup_status,
  'installing advances to authenticating'
);

select throws_ok(
  $$
    select public.record_provider_setup_progress(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-00000000000d',
      'installing', null
    )
  $$,
  'P0001', 'invalid_provider_setup_progress',
  'progress cannot move backwards'
);

-- settle_provider_setup_request -----------------------------------------

select throws_ok(
  $$
    select public.settle_provider_setup_request(
      '40000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-00000000000d',
      true,
      jsonb_build_object(
        'provider', 'codex', 'installation', 'installed', 'version', '1.0.0',
        'authentication', 'authenticated', 'compatibility', 'supported'
      ),
      null, null
    )
  $$,
  'P0001', 'invalid_provider_setup_settlement',
  'settlement requires the device the request was assigned to'
);

select throws_ok(
  $$
    select public.settle_provider_setup_request(
      '40000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-00000000000e',
      true,
      jsonb_build_object(
        'provider', 'codex', 'installation', 'installed', 'version', '1.0.0',
        'authentication', 'signed_out', 'compatibility', 'supported'
      ),
      null, null
    )
  $$,
  'P0001', 'invalid_provider_setup_settlement',
  'completion requires an installed, authenticated, supported provider'
);

select throws_ok(
  $$
    select public.settle_provider_setup_request(
      '40000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-00000000000e',
      true,
      jsonb_build_object(
        'provider', 'claude', 'installation', 'installed', 'version', '1.0.0',
        'authentication', 'authenticated', 'compatibility', 'supported'
      ),
      null, null
    )
  $$,
  'P0001', 'invalid_provider_setup_settlement',
  'completion cannot report a provider the request never asked for'
);

select is(
  public.settle_provider_setup_request(
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-00000000000e',
    true,
    jsonb_build_object(
      'provider', 'codex', 'installation', 'installed', 'version', '1.0.0',
      'authentication', 'authenticated', 'compatibility', 'supported'
    ),
    null, null
  ),
  'completed'::public.provider_setup_status,
  'a ready provider status completes the request'
);

reset role;

select is(
  (
    select installation::text || '/' || authentication::text
      || '/' || compatibility::text
    from public.provider_connections
    where device_id = '30000000-0000-4000-8000-00000000000e'
      and provider = 'codex'
  ),
  'installed/authenticated/supported',
  'completion records the provider connection through the existing upsert'
);

select is(
  (
    select default_device_id::text || '/' || default_provider::text
    from public.ai_user_preferences
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  '30000000-0000-4000-8000-00000000000e/codex',
  'the first completed provider becomes the default'
);

set local role service_role;

select is(
  public.settle_provider_setup_request(
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-00000000000e',
    true,
    jsonb_build_object(
      'provider', 'codex', 'installation', 'installed', 'version', '1.0.0',
      'authentication', 'authenticated', 'compatibility', 'supported'
    ),
    null, null
  ),
  'completed'::public.provider_setup_status,
  'a repeated identical settlement returns the existing terminal status'
);

select throws_ok(
  $$
    select public.settle_provider_setup_request(
      '40000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-00000000000e',
      false, null, 'verification_failed', 'Contradicts the completion'
    )
  $$,
  'P0001', 'conflicting_provider_setup_settlement',
  'a settlement that contradicts the recorded terminal result is refused'
);

select is(
  public.settle_provider_setup_request(
    '40000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-00000000000f',
    false, null, 'authentication_failed', 'Sign-in did not finish'
  ),
  'failed'::public.provider_setup_status,
  'a failure settlement settles as failed'
);

reset role;

select is(
  (
    select error_code::text || '/' || error_message
    from public.provider_setup_requests
    where id = '40000000-0000-4000-8000-000000000003'
  ),
  'authentication_failed/Sign-in did not finish',
  'a failure settlement records the error code and message'
);

set local role service_role;

select throws_ok(
  $$
    select public.settle_provider_setup_request(
      '40000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-00000000000f',
      true,
      jsonb_build_object(
        'provider', 'codex', 'installation', 'installed', 'version', '1.0.0',
        'authentication', 'authenticated', 'compatibility', 'supported'
      ),
      null, null
    )
  $$,
  'P0001', 'conflicting_provider_setup_settlement',
  'a success settlement cannot overwrite a recorded failure'
);

select throws_ok(
  $$
    select public.settle_provider_setup_request(
      '40000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000010',
      false, null, null, 'No code supplied'
    )
  $$,
  'P0001', 'invalid_provider_setup_settlement',
  'a failure settlement requires an error code'
);

select is(
  public.settle_provider_setup_request(
    '40000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000010',
    false, null, 'cancelled', null
  ),
  'cancelled'::public.provider_setup_status,
  'a cancelled error code settles the request as cancelled'
);

select is(
  public.settle_provider_setup_request(
    '40000000-0000-4000-8000-000000000005',
    '30000000-0000-4000-8000-000000000011',
    true,
    jsonb_build_object(
      'provider', 'claude', 'installation', 'installed', 'version', '2.0.0',
      'authentication', 'authenticated', 'compatibility', 'supported'
    ),
    null, null
  ),
  'completed'::public.provider_setup_status,
  'a second provider may also complete'
);

reset role;

select is(
  (
    select default_device_id::text || '/' || default_provider::text
    from public.ai_user_preferences
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  '30000000-0000-4000-8000-00000000000e/codex',
  'a later completion does not replace an existing default'
);

-- set_ai_user_preference ------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);

select throws_ok(
  $$
    select public.set_ai_user_preference(
      '30000000-0000-4000-8000-000000000012', 'claude'
    )
  $$,
  'P0001', 'invalid_ai_user_preference',
  'a signed-out provider connection cannot be saved as the default'
);

select lives_ok(
  $$
    select public.set_ai_user_preference(
      '30000000-0000-4000-8000-000000000012', 'codex'
    )
  $$,
  'a ready provider connection may be saved as the default'
);

reset role;

select is(
  (
    select default_device_id::text || '/' || default_provider::text
    from public.ai_user_preferences
    where user_id = '10000000-0000-4000-8000-000000000003'
  ),
  '30000000-0000-4000-8000-000000000012/codex',
  'set_ai_user_preference stores the chosen device and provider'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);

-- The other half of the wire contract. Re-saving the same choice is what
-- makes this safe to assert here without disturbing the sequence below.
with document as (
  select public.set_ai_user_preference(
    '30000000-0000-4000-8000-000000000012', 'codex'
  ) as payload
)
select ok(
  payload ?& array[
    'userId', 'defaultDeviceId', 'defaultProvider', 'createdAt', 'updatedAt'
  ]
    and (select count(*) from jsonb_object_keys(payload)) = 5,
  'set_ai_user_preference returns exactly its camelCase key set'
)
from document;

with document as (
  select public.set_ai_user_preference(
    '30000000-0000-4000-8000-000000000012', 'codex'
  ) as payload
)
select is(
  payload ->> 'userId' || '/' || (payload ->> 'defaultDeviceId')
    || '/' || (payload ->> 'defaultProvider'),
  '10000000-0000-4000-8000-000000000003'
    || '/30000000-0000-4000-8000-000000000012/codex',
  'set_ai_user_preference maps each camelCase key to its own column'
)
from document;

select lives_ok(
  $$
    select public.set_ai_user_preference(
      '30000000-0000-4000-8000-000000000013', 'codex'
    )
  $$,
  'a user may move their default to another ready device'
);

reset role;

select is(
  (
    select default_device_id::text || '/' || default_provider::text
    from public.ai_user_preferences
    where user_id = '10000000-0000-4000-8000-000000000003'
  ),
  '30000000-0000-4000-8000-000000000013/codex',
  'an explicit choice replaces the existing default'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$
    select public.set_ai_user_preference(
      '30000000-0000-4000-8000-000000000013', 'codex'
    )
  $$,
  'P0001', 'invalid_ai_user_preference',
  'another user''s device cannot become a default'
);

-- Revocation ------------------------------------------------------------

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);

select lives_ok(
  $$
    select public.revoke_execution_device(
      '30000000-0000-4000-8000-000000000013'
    )
  $$,
  'a user may revoke the device holding their default'
);

reset role;

select is(
  (
    select status::text from public.provider_setup_requests
    where id = '40000000-0000-4000-8000-000000000007'
  ),
  'cancelled',
  'revocation cancels the device''s nonterminal setup requests'
);

select is(
  (
    select status::text from public.provider_setup_requests
    where id = '40000000-0000-4000-8000-000000000009'
  ),
  'completed',
  'revocation leaves already-settled setup requests alone'
);

select ok(
  (
    select default_device_id is null and default_provider is null
    from public.ai_user_preferences
    where user_id = '10000000-0000-4000-8000-000000000003'
  ),
  'revoking the default device clears the preference'
);

select is(
  (
    select default_device_id::text || '/' || default_provider::text
    from public.ai_user_preferences
    where user_id = '10000000-0000-4000-8000-000000000001'
  ),
  '30000000-0000-4000-8000-00000000000e/codex',
  'revoking one user''s device leaves another user''s default in place'
);

-- Re-pairing after revocation -------------------------------------------

-- The flow this feature exists for, end to end: the device holding the
-- default is revoked, a replacement is paired, and its setup completes. Every
-- step had coverage in isolation, but not in sequence -- which is how a
-- settlement that skipped on row conflict rather than on a null default could
-- leave this user with no default at all, forever, despite a ready
-- connection and despite never having chosen anything.

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);

select public.create_device_pairing_code(repeat('7', 64), 'codex');

reset role;
set local role service_role;

select public.redeem_device_pairing_code(
  repeat('7', 64), '30000000-0000-4000-8000-000000000021',
  repeat('8', 64), 'darwin', 'Replacement Mac'
);

-- Driven through the real dispatch path rather than a hand-written request
-- id, so what gets settled is the row redemption actually seeded.
select is(
  (
    select public.settle_provider_setup_request(
      dispatchable.request_id,
      '30000000-0000-4000-8000-000000000021',
      true,
      jsonb_build_object(
        'provider', 'codex', 'installation', 'installed', 'version', '1.0.0',
        'authentication', 'authenticated', 'compatibility', 'supported'
      ),
      null, null
    )
    from public.list_dispatchable_provider_setups(
      array['30000000-0000-4000-8000-000000000021'::uuid]
    ) as dispatchable
  ),
  'completed'::public.provider_setup_status,
  'a replacement device completes setup after the original was revoked'
);

reset role;

select is(
  (
    select default_device_id::text || '/' || default_provider::text
    from public.ai_user_preferences
    where user_id = '10000000-0000-4000-8000-000000000003'
  ),
  '30000000-0000-4000-8000-000000000021/codex',
  'a completion after revocation repopulates the cleared default'
);

select is(
  (
    select count(*) from public.ai_user_preferences
    where user_id = '10000000-0000-4000-8000-000000000003'
  ),
  1::bigint,
  'the cleared preference row is refilled in place, not duplicated'
);

-- The one-active index --------------------------------------------------

select throws_ok(
  $$
    insert into public.provider_setup_requests (user_id, device_id, provider)
    values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-00000000000a', 'codex'
    )
  $$,
  '23505', null,
  'a second nonterminal request for the same device and provider is refused'
);

select lives_ok(
  $$
    insert into public.provider_setup_requests (user_id, device_id, provider)
    values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-00000000000f', 'codex'
    )
  $$,
  'a new request is allowed once the previous one for that pair is terminal'
);

-- Row-level security and grants -----------------------------------------

select ok(
  (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.provider_setup_requests'::regclass
  ),
  'row level security is enabled on provider_setup_requests'
);

select ok(
  (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.ai_user_preferences'::regclass
  ),
  'row level security is enabled on ai_user_preferences'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$
    insert into public.provider_setup_requests (user_id, device_id, provider)
    values (
      auth.uid(), '30000000-0000-4000-8000-00000000000d', 'claude'
    )
  $$,
  '42501', null,
  'authenticated cannot insert setup requests directly'
);

select throws_ok(
  $$
    update public.provider_setup_requests
    set status = 'completed'
    where user_id = auth.uid()
  $$,
  '42501', null,
  'authenticated cannot update setup requests directly'
);

select throws_ok(
  $$ delete from public.provider_setup_requests where user_id = auth.uid() $$,
  '42501', null,
  'authenticated cannot delete setup requests directly'
);

select throws_ok(
  $$
    insert into public.ai_user_preferences (
      user_id, default_device_id, default_provider
    )
    values (
      auth.uid(), '30000000-0000-4000-8000-00000000000d', 'claude'
    )
  $$,
  '42501', null,
  'authenticated cannot insert preferences directly'
);

select throws_ok(
  $$
    update public.ai_user_preferences
    set default_provider = 'claude'
    where user_id = auth.uid()
  $$,
  '42501', null,
  'authenticated cannot update preferences directly'
);

select throws_ok(
  $$ delete from public.ai_user_preferences where user_id = auth.uid() $$,
  '42501', null,
  'authenticated cannot delete preferences directly'
);

select is(
  (
    select count(*) from public.provider_setup_requests
    where user_id <> auth.uid()
  ),
  0::bigint,
  'a user cannot read another user''s setup requests'
);

select ok(
  (select count(*) > 0 from public.provider_setup_requests),
  'a user can read their own setup requests'
);

select is(
  (select count(*) from public.ai_user_preferences),
  1::bigint,
  'a user reads exactly their own preference row'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select is(
  (select count(*) from public.provider_setup_requests),
  1::bigint,
  'another user sees only the single request that is theirs'
);

select is(
  (select count(*) from public.ai_user_preferences),
  0::bigint,
  'a user with no preference row reads nothing'
);

reset role;
set local role anon;

select throws_ok(
  $$ select count(*) from public.provider_setup_requests $$,
  '42501', null,
  'anon cannot read setup requests at all'
);

select throws_ok(
  $$
    insert into public.provider_setup_requests (user_id, device_id, provider)
    values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-00000000000d', 'claude'
    )
  $$,
  '42501', null,
  'anon cannot insert setup requests'
);

select throws_ok(
  $$ select count(*) from public.ai_user_preferences $$,
  '42501', null,
  'anon cannot read preferences at all'
);

select throws_ok(
  $$
    insert into public.ai_user_preferences (
      user_id, default_device_id, default_provider
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-00000000000d', 'claude'
    )
  $$,
  '42501', null,
  'anon cannot insert preferences'
);

reset role;

select function_privs_are(
  'public', 'create_provider_setup_request',
  array['uuid', 'public.ai_provider'],
  'authenticated', array['EXECUTE'],
  'a signed-in user may request provider setup'
);

select function_privs_are(
  'public', 'create_provider_setup_request',
  array['uuid', 'public.ai_provider'],
  'anon', array[]::name[],
  'anon may not request provider setup'
);

select function_privs_are(
  'public', 'set_ai_user_preference',
  array['uuid', 'public.ai_provider'],
  'anon', array[]::name[],
  'anon may not choose a default provider'
);

select function_privs_are(
  'public', 'settle_provider_setup_request',
  array[
    'uuid', 'uuid', 'boolean', 'jsonb',
    'public.provider_setup_error_code', 'text'
  ],
  'authenticated', array[]::name[],
  'a signed-in user cannot settle a setup request'
);

select function_privs_are(
  'public', 'record_provider_setup_progress',
  array['uuid', 'uuid', 'public.provider_setup_stage', 'text'],
  'authenticated', array[]::name[],
  'a signed-in user cannot report setup progress'
);

-- Lock order --------------------------------------------------------------

-- An earlier wave of this branch shipped a deadlock from two functions taking
-- the same two row locks in opposite orders, which no behavioural test can
-- see because each function is correct alone. These assertions read the
-- installed function bodies instead, the same way ai_task_transitions.test
-- .sql pins the device -> task -> attempt order, and extend it with the chain
-- these functions add: execution_devices -> provider_setup_requests ->
-- provider_connections -> ai_user_preferences.

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.create_provider_setup_request(uuid,public.ai_provider)'
          ::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(
    body,
    'from public.execution_devices as device where device.id = '
      || 'target_device_id and device.user_id = caller_id for update'
  ) > 0
    and strpos(
      body,
      'from public.execution_devices as device where device.id = '
        || 'target_device_id and device.user_id = caller_id for update'
    ) < strpos(
      body,
      'from public.provider_setup_requests as request where '
        || 'request.device_id = target_device_id'
    ),
  'request creation locks the device before the live request it looks for'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.list_dispatchable_provider_setups(uuid[])'::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(body, 'order by device.id for update') > 0
    and strpos(body, 'order by request.id for update') > 0
    and strpos(body, 'order by device.id for update')
      < strpos(body, 'order by request.id for update'),
  'dispatch locks UUID-ordered devices before UUID-ordered requests'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.record_provider_setup_progress(uuid,uuid,public.provider_setup_stage,text)'::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(
    body,
    'from public.execution_devices as device where device.id = '
      || 'target_device_id and device.status = ''active'' and '
      || 'device.revoked_at is null for update'
  ) > 0
    and strpos(
      body,
      'from public.execution_devices as device where device.id = '
        || 'target_device_id and device.status = ''active'' and '
        || 'device.revoked_at is null for update'
    ) < strpos(
      body,
      'from public.provider_setup_requests as request where request.id = '
        || 'target_request_id for update'
    ),
  'progress locks the device before the request, matching the task paths'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.settle_provider_setup_request(uuid,uuid,boolean,jsonb,public.provider_setup_error_code,text)'::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(
    body,
    'from public.execution_devices as device where device.id = '
      || 'target_device_id and device.status = ''active'' and '
      || 'device.revoked_at is null for update'
  ) > 0
    and strpos(
      body,
      'from public.execution_devices as device where device.id = '
        || 'target_device_id and device.status = ''active'' and '
        || 'device.revoked_at is null for update'
    ) < strpos(
      body,
      'from public.provider_setup_requests as request where request.id = '
        || 'target_request_id for update'
    )
    and strpos(
      body,
      'from public.provider_setup_requests as request where request.id = '
        || 'target_request_id for update'
    ) < strpos(body, 'perform public.upsert_provider_connections'),
  'settlement locks device, then request, then the connection upsert'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.revoke_execution_device(uuid)'::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(
    body,
    'from public.execution_devices as device where device.id = '
      || 'target_device_id and device.user_id = caller_id for update'
  ) > 0
    and strpos(
      body,
      'from public.execution_devices as device where device.id = '
        || 'target_device_id and device.user_id = caller_id for update'
    ) < strpos(
      body,
      'update public.provider_setup_requests set status = ''cancelled'''
    )
    and strpos(
      body,
      'update public.provider_setup_requests set status = ''cancelled'''
    ) < strpos(
      body,
      'update public.ai_user_preferences set default_device_id = null'
    ),
  'revocation writes device, then setup requests, then the preference'
)
from function_body;

select * from finish();
rollback;
