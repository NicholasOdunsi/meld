begin;

create extension if not exists pgtap with schema extensions;

select plan(14);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f1000000-0000-4000-8000-000000000001','authenticated','authenticated','shelf-owner@example.com','',now(),'{}','{}',now(),now()),
  ('f1000000-0000-4000-8000-000000000002','authenticated','authenticated','shelf-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by) values
  ('f2000000-0000-4000-8000-000000000001','Shelf WS','f1000000-0000-4000-8000-000000000001');
insert into public.projects (id, workspace_id, name, created_by) values
  ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','Shelf Project','f1000000-0000-4000-8000-000000000001');
insert into public.rooms (id, workspace_id, project_id, name, owner_id) values
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','Shelf Room','f1000000-0000-4000-8000-000000000001');

set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select ok(
  public.create_capture_connect_code('f2000000-0000-4000-8000-000000000001', repeat('1',64)) > now(),
  'member creates a connect code that expires in the future');

select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.create_capture_connect_code('f2000000-0000-4000-8000-000000000001', repeat('2',64)) $$,
  'P0001', 'not_authorized', 'non-member cannot create a connect code');
select throws_ok(
  $$ select public.redeem_capture_connect_code(repeat('1',64), repeat('a',64), 'Mac') $$,
  '42501', null, 'authenticated users cannot redeem (service role only)');

reset role;
set local role service_role;
select is(
  public.redeem_capture_connect_code(repeat('1',64), repeat('a',64), 'Studio Mac') ->> 'workspace_name',
  'Shelf WS', 'service role redeems a valid code');
select throws_ok(
  $$ select public.redeem_capture_connect_code(repeat('1',64), repeat('b',64), 'Mac') $$,
  'P0001', 'invalid_code', 'a code is single-use');
select is(
  public.resolve_capture_token(repeat('a',64)) ->> 'user_id',
  'f1000000-0000-4000-8000-000000000001', 'active token resolves to its user');
select is(public.resolve_capture_token(repeat('f',64)), null::jsonb, 'unknown token resolves to null');

-- Expired code.
reset role;
insert into public.capture_connect_codes (user_id, workspace_id, code_hash, expires_at)
values ('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001', repeat('3',64), now() - interval '1 minute');
set local role service_role;
select throws_ok(
  $$ select public.redeem_capture_connect_code(repeat('3',64), repeat('c',64), 'Mac') $$,
  'P0001', 'invalid_code', 'an expired code fails');

-- Reconnecting revokes the previous token.
reset role;
insert into public.capture_connect_codes (user_id, workspace_id, code_hash, expires_at)
values ('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001', repeat('4',64), now() + interval '10 minutes');
set local role service_role;
select lives_ok($$ select public.redeem_capture_connect_code(repeat('4',64), repeat('d',64), 'New Mac') $$, 'second connect succeeds');
select is(public.resolve_capture_token(repeat('a',64)), null::jsonb, 'old token no longer resolves');
select is(public.resolve_capture_token(repeat('d',64)) ->> 'workspace_id', 'f2000000-0000-4000-8000-000000000001', 'new token resolves');

-- Room names only, for rooms the user can edit.
select is(
  (select room_name from public.list_capture_rooms('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001')),
  'Shelf Room', 'owner sees their editable room');
select is(
  (select count(*)::int from public.list_capture_rooms('f1000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001')),
  0, 'outsider sees no rooms');

-- Owner revokes from Settings.
-- authenticated can select token columns except token_hash, so look up by
-- the active (unrevoked) row rather than filtering on the secret hash.
reset role;
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select is(
  public.revoke_capture_token((
    select id from public.capture_tokens
    where workspace_id = 'f2000000-0000-4000-8000-000000000001'
      and revoked_at is null
  )),
  true, 'owner revokes their token');

select * from finish();
rollback;
