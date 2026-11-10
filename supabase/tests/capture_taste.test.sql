-- supabase/tests/capture_taste.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(19);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','taste-owner@example.com','',now(),'{}','{}',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','authenticated','authenticated','taste-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by)
values ('e2000000-0000-4000-8000-000000000001','Taste WS','e1000000-0000-4000-8000-000000000001');
insert into public.taste_profiles (workspace_id, user_id, board, version)
values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
        '{"density":"airy"}'::jsonb, 1);
insert into public.taste_suggestions (id, workspace_id, user_id, refresh_id, tile, op, value, value_key, reason, board_version)
values ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001',
        gen_random_uuid(),'density','set','"balanced"','density:set:balanced','Seen lately',1);

select is(
  (public.capture_get_taste('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001'))->>'version',
  '1', 'owner reads the profile');
select is(
  (public.capture_get_taste('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001'))->>'apple_rules',
  'true', 'apple_rules defaults to on');
select throws_ok(
  $$ select public.capture_get_taste('e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001') $$,
  'P0001', 'not_authorized', 'a non-member cannot read the profile');
select is(
  jsonb_array_length(public.capture_list_taste_suggestions('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001')),
  1, 'lists the pending suggestion');

select is(
  public.capture_save_taste_board('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','{"density":"dense"}'::jsonb, 1, 'density'),
  2, 'save bumps the version');
select is(
  public.capture_save_taste_board('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','{"density":"light"}'::jsonb, 1, null),
  null, 'a stale version returns null');
select is(
  (select locks ? 'density' from public.taste_profiles where workspace_id = 'e2000000-0000-4000-8000-000000000001'),
  true, 'editing a tile locks it');
select throws_ok(
  $$ select public.capture_save_taste_board('e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','{}'::jsonb, 2, null) $$,
  'P0001', 'not_authorized', 'a non-member cannot save');

select is(
  public.capture_decide_taste_suggestion('e1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','kept','{"density":"balanced"}'::jsonb, 2),
  'kept', 'keeping applies the board');
select is(
  public.capture_decide_taste_suggestion('e1000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','rejected','{}'::jsonb, 3),
  'kept', 'deciding twice returns the first decision');

select lives_ok(
  $$ select public.capture_set_apple_rules('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001', false) $$,
  'owner can switch Apple rules off');

select lives_ok(
  $$ select public.capture_clear_taste_lock('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','density') $$,
  'owner can clear a tile lock');
select is(
  (select locks ? 'density' from public.taste_profiles where workspace_id = 'e2000000-0000-4000-8000-000000000001'),
  false, 'the lock is gone');

select is(
  jsonb_array_length(public.capture_add_taste_cards(
    'e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001',
    '[{"tile":"spacing","op":"set","value":"generous","value_key":"spacing:set:generous","reason":"From the brand guide","source":{"kind":"file","name":"Brand.pdf","locator":"page 3"},"origin":"composer"}]'::jsonb,
    '{}')),
  1, 'adds a composer card');
select is(
  (select origin || ':' || (source->>'name') from public.taste_suggestions where value_key = 'spacing:set:generous' and status = 'pending' limit 1),
  'composer:Brand.pdf', 'stores origin and source');
select is(
  (public.capture_list_taste_suggestions('e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001')->0)->>'origin',
  'composer', 'listing returns the origin');
select is(
  jsonb_array_length(public.capture_add_taste_cards(
    'e1000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001',
    '[{"tile":"density","op":"set","value":"airy","value_key":"density:set:airy","reason":"r","source":{"kind":"words","name":"Your words","locator":""},"origin":"composer"}]'::jsonb,
    array[(select id from public.taste_suggestions where value_key = 'spacing:set:generous' limit 1)])),
  1, 'a follow-up replaces earlier cards');
select is(
  (select status from public.taste_suggestions where value_key = 'spacing:set:generous' limit 1),
  'superseded', 'the replaced card is superseded');
select throws_ok(
  $$ select public.capture_add_taste_cards('e1000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000001','[]'::jsonb,'{}') $$,
  'P0001', 'not_authorized', 'a non-member cannot add cards');

select * from finish();
rollback;
