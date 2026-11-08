-- supabase/tests/taste_profile.test.sql
begin;
create extension if not exists pgtap with schema extensions;
select plan(22);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','taste-owner@example.com','',now(),'{}','{}',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','authenticated','authenticated','taste-other@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by)
values ('e2000000-0000-4000-8000-000000000001','Taste WS','e1000000-0000-4000-8000-000000000001');
insert into public.memberships (workspace_id, user_id, role)
values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','member');
insert into public.projects (id, workspace_id, name, created_by)
values ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','P','e1000000-0000-4000-8000-000000000001');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values ('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','R','e1000000-0000-4000-8000-000000000001');
insert into public.design_screens (id, room_id, workspace_id, name, created_by)
values ('e5000000-0000-4000-8000-000000000001','e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','S','e1000000-0000-4000-8000-000000000001');

-- 7 ready, sorted items owned by the owner.
insert into public.inspiration_items (id, workspace_id, created_by, status, storage_path, mime_type, byte_size, width, height, content_hash, capture_channel)
select ('e6000000-0000-4000-8000-00000000000' || n)::uuid, 'e2000000-0000-4000-8000-000000000001', 'e1000000-0000-4000-8000-000000000001',
       'pending', 'e2000000-0000-4000-8000-000000000001/' || n || '.png', 'image/png', 10, 10, 10, repeat(n::text, 64), 'web'
from generate_series(1, 7) n;
update public.inspiration_items set status = 'ready' where workspace_id = 'e2000000-0000-4000-8000-000000000001';
update public.inspiration_labels
set status = 'sorted', device = 'mobile', screen_type = 'login', theme = 'light', colors = '{#ffffff}', description = 'd'
where workspace_id = 'e2000000-0000-4000-8000-000000000001';

select has_table('public', 'taste_profiles', 'taste_profiles exists');
select has_table('public', 'taste_suggestions', 'taste_suggestions exists');
select has_table('public', 'taste_signals', 'taste_signals exists');

-- Fewer than 8 sorted images: no claim.
select is((select count(*)::int from public.claim_taste_refresh('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001')), 0, 'no claim under 8 sorted images');

insert into public.inspiration_items (id, workspace_id, created_by, status, storage_path, mime_type, byte_size, width, height, content_hash, capture_channel)
values ('e6000000-0000-4000-8000-000000000008','e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','pending','e2000000-0000-4000-8000-000000000001/8.png','image/png',10,10,10,repeat('8',64),'web');
update public.inspiration_items set status = 'ready' where id = 'e6000000-0000-4000-8000-000000000008';
update public.inspiration_labels set status = 'sorted', device = 'mobile', screen_type = 'login', theme = 'light', colors = '{#ffffff}', description = 'd'
where item_id = 'e6000000-0000-4000-8000-000000000008';

select is((select is_first from public.claim_taste_refresh('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001')), true, 'first claim at 8 sorted images');
select is((select count(*)::int from public.claim_taste_refresh('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001')), 0, 'a live claim blocks a second claim');

select is(public.finish_taste_refresh('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001','{"designLanguage":["minimal"]}'::jsonb, null, 8), 0, 'first refresh writes the board');
select is((select version from public.taste_profiles where user_id = 'e1000000-0000-4000-8000-000000000001'), 1, 'board version is 1');
select is((select refresh_claimed_at from public.taste_profiles where user_id = 'e1000000-0000-4000-8000-000000000001'), null, 'finish releases the claim');
select is((select count(*)::int from public.claim_taste_refresh('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001')), 0, '24 h rule blocks an immediate second refresh');

-- Pretend the last refresh was 2 days ago with 3 sorted at the time (8 - 3 = 5 new).
update public.taste_profiles set last_refresh_at = now() - interval '2 days', sorted_count_at_refresh = 3
where user_id = 'e1000000-0000-4000-8000-000000000001';
select is((select is_first from public.claim_taste_refresh('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001')), false, 'later claim after 5 new sorted images');
select is(public.finish_taste_refresh('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001', null,
  '[{"tile":"density","op":"set","value":"balanced","valueKey":"density:set:balanced","reason":"r","evidenceItemIds":["e6000000-0000-4000-8000-000000000001"]},
    {"tile":"designLanguage","op":"add","value":"airy","valueKey":"designLanguage:add:airy","reason":"r","evidenceItemIds":[]}]'::jsonb, 8), 2, 'later refresh inserts suggestions');

-- Owner RPCs.
set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.taste_suggestions where status = 'pending'), 2, 'owner reads own pending suggestions');
select throws_ok($$ update public.taste_profiles set version = 99 $$, '42501', null, 'owner cannot write tables directly');
select throws_ok($$ select * from public.claim_taste_refresh('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000001') $$, '42501', null, 'authenticated cannot claim');

select is(public.decide_taste_suggestion((select id from public.taste_suggestions where tile = 'density'), 'kept', '{"designLanguage":["minimal"],"density":"balanced"}'::jsonb, 1), 'kept', 'keep applies at the current version');
select is((select version from public.taste_profiles), 2, 'keep bumps the version');
select is(public.decide_taste_suggestion((select id from public.taste_suggestions where tile = 'designLanguage'), 'kept', '{"designLanguage":["minimal","airy"]}'::jsonb, 1), 'superseded', 'a stale version supersedes instead of applying');
select is(public.save_taste_board('e2000000-0000-4000-8000-000000000001', '{"designLanguage":["bold"]}'::jsonb, 2, 'designLanguage'), 3, 'save_taste_board writes and returns the new version');
select is((select (locks ->> 'designLanguage')::int from public.taste_profiles), 8, 'editing a tile locks it at the sorted count');

select lives_ok($$ select public.record_taste_signal('e5000000-0000-4000-8000-000000000001', 'too_plain') $$, 'owner records a redo signal');

-- Another member sees nothing of the owner's taste.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.taste_profiles) + (select count(*)::int from public.taste_suggestions) + (select count(*)::int from public.taste_signals), 0, 'other members cannot read the owner''s taste');

select * from finish();
rollback;
