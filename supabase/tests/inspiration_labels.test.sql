begin;
create extension if not exists pgtap with schema extensions;
select plan(16);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f1000000-0000-4000-8000-000000000001','authenticated','authenticated','lbl-owner@example.com','',now(),'{}','{}',now(),now()),
  ('f1000000-0000-4000-8000-000000000002','authenticated','authenticated','lbl-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by) values
  ('f2000000-0000-4000-8000-000000000001','Lbl WS','f1000000-0000-4000-8000-000000000001');

-- One item already ready before the trigger matters is covered by the migration's
-- backfill; here we exercise the trigger path.
insert into public.inspiration_items (id, workspace_id, created_by, status, storage_path, mime_type, byte_size, width, height, content_hash, capture_channel)
values
  ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','pending','f2000000-0000-4000-8000-000000000001/f3000000-0000-4000-8000-000000000001.png','image/png',10,10,10,repeat('1',64),'web'),
  ('f3000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','pending','f2000000-0000-4000-8000-000000000001/f3000000-0000-4000-8000-000000000002.png','image/png',10,10,10,repeat('2',64),'web');

select has_table('public','inspiration_labels','inspiration_labels exists');
select is((select count(*)::int from public.inspiration_labels where item_id in ('f3000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000002')), 0, 'pending items have no label row');

update public.inspiration_items set status = 'ready' where workspace_id = 'f2000000-0000-4000-8000-000000000001';
select is((select count(*)::int from public.inspiration_labels where workspace_id = 'f2000000-0000-4000-8000-000000000001' and status = 'unsorted'), 2, 'becoming ready creates an unsorted label row');

-- Members read; outsiders and direct writes are refused.
set local role authenticated;
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.inspiration_labels where workspace_id = 'f2000000-0000-4000-8000-000000000001'), 2, 'members can read labels');
select throws_ok($$ update public.inspiration_labels set status = 'sorted' $$, '42501', null, 'members cannot write labels directly');
select throws_ok($$ select public.claim_inspiration_sort('f2000000-0000-4000-8000-000000000001', 10) $$, '42501', null, 'authenticated cannot claim');
select set_config('request.jwt.claim.sub','f1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.inspiration_labels where workspace_id = 'f2000000-0000-4000-8000-000000000001'), 0, 'outsiders read nothing');
reset role;

-- Claiming: limit, attempts, and no double claim while fresh.
set local role service_role;
select is((select count(*)::int from public.claim_inspiration_sort('f2000000-0000-4000-8000-000000000001', 1)), 1, 'claim respects the limit');
select is((select count(*)::int from public.claim_inspiration_sort('f2000000-0000-4000-8000-000000000001', 10)), 1, 'a fresh claim is not handed out twice');
select is((select count(*)::int from public.claim_inspiration_sort('f2000000-0000-4000-8000-000000000001', 10)), 0, 'nothing left to claim');
select is((select attempts from public.inspiration_labels where item_id = 'f3000000-0000-4000-8000-000000000001'), 1, 'claiming counts an attempt');

-- A stale claim is handed out again. Fixture writes run as postgres; RPCs stay
-- on service_role (the only role granted execute).
reset role;
update public.inspiration_labels set claimed_at = now() - interval '6 minutes' where item_id = 'f3000000-0000-4000-8000-000000000002';
set local role service_role;
select is((select item_id from public.claim_inspiration_sort('f2000000-0000-4000-8000-000000000001', 10)), 'f3000000-0000-4000-8000-000000000002'::uuid, 'stale claims are re-claimed');

-- Saving labels.
select ok(public.save_inspiration_labels('f3000000-0000-4000-8000-000000000001',
  '{"device":"mobile","screenType":"login","patterns":["form"],"theme":"dark","colors":["#0f172a"],"styleWords":["minimal"],"description":"Bold headline."}'::jsonb,
  'deepseek-flash'), 'save returns true');
select is((select status || ':' || device || ':' || screen_type || ':' || model from public.inspiration_labels where item_id = 'f3000000-0000-4000-8000-000000000001'),
  'sorted:mobile:login:deepseek-flash', 'save stores labels and marks sorted');
select throws_ok($$ select public.save_inspiration_labels('f3000000-0000-4000-8000-000000000002', '{"device":"watch","screenType":"login","patterns":[],"theme":"dark","colors":["#000000"],"styleWords":[],"description":"x"}'::jsonb, 'm') $$,
  '23514', null, 'check constraints reject vocabulary outside the lists');

-- Releasing: third failed attempt becomes unsortable.
reset role;
update public.inspiration_labels set attempts = 3 where item_id = 'f3000000-0000-4000-8000-000000000002';
set local role service_role;
select public.release_inspiration_sort('f3000000-0000-4000-8000-000000000002');
select is((select status || ':' || coalesce(claimed_at::text, 'null') from public.inspiration_labels where item_id = 'f3000000-0000-4000-8000-000000000002'),
  'unsortable:null', 'release after 3 attempts marks unsortable and clears the claim');

select * from finish();
rollback;
