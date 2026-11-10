-- supabase/tests/taste_new_tiles.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(6);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values ('e4000000-0000-4000-8000-000000000001','authenticated','authenticated','new-tiles@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by)
values ('e5000000-0000-4000-8000-000000000001','New tiles WS','e4000000-0000-4000-8000-000000000001');
insert into public.taste_profiles (workspace_id, user_id, board, version)
values ('e5000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','{"density":"airy"}'::jsonb, 1);

select lives_ok(
  $$ insert into public.taste_suggestions (workspace_id, user_id, refresh_id, tile, op, value, value_key, reason, board_version)
     values ('e5000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',gen_random_uuid(),'motion','set','"smooth"','motion:set:smooth','You asked for calm',1) $$,
  'a motion suggestion can be stored');
select throws_ok(
  $$ insert into public.taste_suggestions (workspace_id, user_id, refresh_id, tile, op, value, value_key, reason, board_version)
     values ('e5000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001',gen_random_uuid(),'colour','set','"x"','colour:set:x','nope',1) $$,
  '23514', null, 'an unknown tile is still refused');
select is(
  public.capture_save_taste_board('e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','{"shape":{"corners":"round","depth":"flat"}}'::jsonb, 1, 'shape'),
  2, 'saving the shape tile locks it and bumps the version');
select is(
  (select locks ? 'shape' from public.taste_profiles where workspace_id = 'e5000000-0000-4000-8000-000000000001'),
  true, 'the shape lock is recorded');
select lives_ok(
  $$ select public.capture_clear_taste_lock('e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','voice') $$,
  'the voice lock can be cleared');
select throws_ok(
  $$ select public.capture_clear_taste_lock('e4000000-0000-4000-8000-000000000001','e5000000-0000-4000-8000-000000000001','nonsense') $$,
  'P0001', 'invalid_request', 'an unknown lock tile is refused');

select * from finish();
rollback;
