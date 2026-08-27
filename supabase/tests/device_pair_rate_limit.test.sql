begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_table(
  'public',
  'device_pair_rate_limits',
  'pairing attempts have durable storage'
);

select function_privs_are(
  'public',
  'consume_device_pair_attempt',
  array['text'],
  'service_role',
  array['EXECUTE'],
  'only the pairing server role may consume attempts'
);

set local role anon;
select throws_ok(
  $$ select public.consume_device_pair_attempt(repeat('1', 64)) $$,
  '42501',
  null,
  'anonymous callers cannot invoke the limiter'
);

set local role authenticated;
select throws_ok(
  $$ select public.consume_device_pair_attempt(repeat('1', 64)) $$,
  '42501',
  null,
  'authenticated callers cannot invoke the limiter'
);

set local role service_role;

select ok(
  (
    select bool_and(public.consume_device_pair_attempt(repeat('1', 64)))
    from generate_series(1, 10)
  ),
  'the first ten attempts in a window are allowed'
);

select is(
  public.consume_device_pair_attempt(repeat('1', 64)),
  false,
  'an eleventh attempt in the same window is refused'
);

select is(
  public.consume_device_pair_attempt(repeat('2', 64)),
  true,
  'a different client has an independent allowance'
);

select throws_ok(
  $$ select count(*) from public.device_pair_rate_limits $$,
  '42501',
  null,
  'the service role cannot read limiter state directly'
);

reset role;
update public.device_pair_rate_limits
set window_started_at = pg_catalog.statement_timestamp() - interval '11 minutes'
where client_key = repeat('1', 64);

set local role service_role;
select is(
  public.consume_device_pair_attempt(repeat('1', 64)),
  true,
  'an expired client window starts over'
);

select * from finish();
rollback;
