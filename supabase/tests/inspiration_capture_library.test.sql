begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

-- Owner (member + room editor), outsider, and a second workspace.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('f1000000-0000-4000-8000-000000000001','authenticated','authenticated','lib-owner@example.com','',now(),'{}','{}',now(),now()),
  ('f1000000-0000-4000-8000-000000000003','authenticated','authenticated','lib-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by) values
  ('f2000000-0000-4000-8000-000000000001','Lib WS','f1000000-0000-4000-8000-000000000001'),
  ('f2000000-0000-4000-8000-000000000002','Other WS','f1000000-0000-4000-8000-000000000003');
insert into public.projects (id, workspace_id, name, created_by) values
  ('f3000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','Voxecore','f1000000-0000-4000-8000-000000000001'),
  ('f3000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000002','Elsewhere','f1000000-0000-4000-8000-000000000003');
insert into public.rooms (id, workspace_id, project_id, name, owner_id) values
  ('f4000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f3000000-0000-4000-8000-000000000001','Main','f1000000-0000-4000-8000-000000000001'),
  ('f4000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000002','f3000000-0000-4000-8000-000000000002','Their Room','f1000000-0000-4000-8000-000000000003');

-- Items: two ready (older, newer), one pending, one in the other workspace.
insert into public.inspiration_items (id, workspace_id, created_by, status, storage_path, mime_type, byte_size, width, height, content_hash, note, capture_channel, created_at) values
  ('f5000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','ready','f2000000-0000-4000-8000-000000000001/a.png','image/png',10,400,300,repeat('1',64),'old','shelf',now() - interval '2 days'),
  ('f5000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','ready','f2000000-0000-4000-8000-000000000001/b.png','image/png',10,300,600,repeat('2',64),null,'shelf',now() - interval '1 day'),
  ('f5000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-000000000001','f1000000-0000-4000-8000-000000000001','pending','f2000000-0000-4000-8000-000000000001/c.png','image/png',10,10,10,repeat('3',64),null,'shelf',now()),
  ('f5000000-0000-4000-8000-000000000004','f2000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000003','ready','f2000000-0000-4000-8000-000000000002/d.png','image/png',10,10,10,repeat('4',64),null,'shelf',now());
insert into public.inspiration_labels (item_id, workspace_id, status, device, screen_type, theme, colors, description) values
  ('f5000000-0000-4000-8000-000000000002','f2000000-0000-4000-8000-000000000001','sorted','web','pricing','dark','{#101010}','Three glass pricing cards.');
insert into public.room_inspiration (room_id, item_id, added_by) values
  ('f4000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000002','f1000000-0000-4000-8000-000000000001');

-- Grants: only service_role may call the capture RPCs.
select ok(not has_function_privilege('authenticated', 'public.capture_list_inspiration(uuid, uuid, integer, integer)', 'execute'), 'authenticated cannot list via capture');
select ok(has_function_privilege('service_role', 'public.capture_list_inspiration(uuid, uuid, integer, integer)', 'execute'), 'service_role can list via capture');
select ok(not has_function_privilege('anon', 'public.capture_delete_inspiration_items(uuid, uuid, uuid[])', 'execute'), 'anon cannot delete via capture');

set local role service_role;

-- List: ready only, newest first, label + rooms attached.
select is(
  jsonb_array_length(public.capture_list_inspiration('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',0,100)),
  2, 'list returns only ready items of the workspace');
select is(
  public.capture_list_inspiration('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',0,100) -> 0 ->> 'id',
  'f5000000-0000-4000-8000-000000000002', 'newest first');
select is(
  public.capture_list_inspiration('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',0,100) -> 0 ->> 'description',
  'Three glass pricing cards.', 'description comes from labels');
select is(
  public.capture_list_inspiration('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',0,100) -> 0 -> 'rooms' -> 0 ->> 'project_name',
  'Voxecore', 'rooms carry project names');
select is(
  public.capture_list_inspiration('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001',1,1) -> 0 ->> 'id',
  'f5000000-0000-4000-8000-000000000001', 'offset and limit page the list');
select throws_ok(
  $$ select public.capture_list_inspiration('f1000000-0000-4000-8000-000000000003','f2000000-0000-4000-8000-000000000001',0,100) $$,
  'P0001', 'not_authorized', 'outsider cannot list');

-- Note.
select lives_ok(
  $$ select public.capture_update_inspiration_note('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f5000000-0000-4000-8000-000000000001','  fresh  ') $$,
  'owner updates a note');
select is((select note from public.inspiration_items where id = 'f5000000-0000-4000-8000-000000000001'), 'fresh', 'note is trimmed and saved');
select throws_ok(
  $$ select public.capture_update_inspiration_note('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000002','f5000000-0000-4000-8000-000000000004','x') $$,
  'P0001', 'not_found', 'a token for one workspace cannot touch another');

-- Link.
select is(
  public.capture_link_inspiration_items('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000001', array['f5000000-0000-4000-8000-000000000001'::uuid,'f5000000-0000-4000-8000-000000000002'::uuid]),
  1, 'links new items, skips existing links');
select throws_ok(
  $$ select public.capture_link_inspiration_items('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001','f4000000-0000-4000-8000-000000000002', array['f5000000-0000-4000-8000-000000000001'::uuid]) $$,
  'P0001', 'not_found', 'cannot link into a room outside the workspace');

-- Delete.
select is(
  public.capture_delete_inspiration_items('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001', array['f5000000-0000-4000-8000-000000000001'::uuid]),
  array['f2000000-0000-4000-8000-000000000001/a.png'], 'delete returns the storage paths');
select throws_ok(
  $$ select public.capture_delete_inspiration_items('f1000000-0000-4000-8000-000000000001','f2000000-0000-4000-8000-000000000001', array['f5000000-0000-4000-8000-000000000004'::uuid]) $$,
  'P0001', 'not_authorized', 'cannot delete another workspace''s item');

select * from finish();
rollback;
