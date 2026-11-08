begin;

create extension if not exists pgtap with schema extensions;

select plan(24);

-- Fixtures: owner (member + room editor), viewer (member, view-only in room),
-- outsider (no membership), and a second workspace with its own room.
insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','insp-owner@example.com','',now(),'{}','{}',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','authenticated','authenticated','insp-viewer@example.com','',now(),'{}','{}',now(),now()),
  ('e1000000-0000-4000-8000-000000000003','authenticated','authenticated','insp-outsider@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by) values
  ('e2000000-0000-4000-8000-000000000001','Insp WS','e1000000-0000-4000-8000-000000000001'),
  ('e2000000-0000-4000-8000-000000000002','Other WS','e1000000-0000-4000-8000-000000000003');
insert into public.memberships (workspace_id, user_id, role) values
  ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','member');
insert into public.projects (id, workspace_id, name, created_by) values
  ('e3000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','Insp Project','e1000000-0000-4000-8000-000000000001'),
  ('e3000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','Other Project','e1000000-0000-4000-8000-000000000003');
insert into public.rooms (id, workspace_id, project_id, name, owner_id) values
  ('e4000000-0000-4000-8000-000000000001','e2000000-0000-4000-8000-000000000001','e3000000-0000-4000-8000-000000000001','Insp Room','e1000000-0000-4000-8000-000000000001'),
  ('e4000000-0000-4000-8000-000000000002','e2000000-0000-4000-8000-000000000002','e3000000-0000-4000-8000-000000000002','Other Room','e1000000-0000-4000-8000-000000000003');
insert into public.room_participants (room_id, user_id, access, added_by) values
  ('e4000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','view','e1000000-0000-4000-8000-000000000001')
on conflict (room_id, user_id) do update set access = excluded.access;

select has_table('public','inspiration_items','inspiration_items exists');
select has_table('public','room_inspiration','room_inspiration exists');

set local role authenticated;
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);

-- Intent → pending row with a workspace-scoped storage path.
select is(
  (select (public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('a',64), 'image/png', 1000, 10, 20, 'https://pinterest.com/pin/1', '  nice nav  ', 'web') -> 'item' ->> 'status')),
  'pending', 'intent creates a pending item');
select is(
  (select note from public.inspiration_items where content_hash = repeat('a',64)),
  'nice nav', 'note is trimmed');
select ok(
  (select storage_path ~ '^e2000000-0000-4000-8000-000000000001/[0-9a-f-]{36}\.png$' from public.inspiration_items where content_hash = repeat('a',64)),
  'storage path is <workspace>/<id>.png');

-- Retrying a never-finished upload reuses the same row (no duplicate flag).
select is(
  (select (public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('a',64), 'image/png', 1000, 10, 20, null, null, 'web') ->> 'duplicate')::boolean),
  false, 'a pending item is retried, not reported as a duplicate');
select is((select count(*)::int from public.inspiration_items where content_hash = repeat('a',64)), 1, 'retry does not add a row');

select lives_ok(
  $$ select public.finalize_inspiration_item((select id from public.inspiration_items where content_hash = repeat('a',64))) $$,
  'creator can finalize');
select is((select status from public.inspiration_items where content_hash = repeat('a',64)), 'ready', 'finalized item is ready');

-- Same bytes again → duplicate, note updated only when a non-empty note is given.
select is(
  (select (public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('a',64), 'image/png', 1000, 10, 20, null, '   ', 'shelf') ->> 'duplicate')::boolean),
  true, 'ready item with the same hash is a duplicate');
select is((select note from public.inspiration_items where content_hash = repeat('a',64)), 'nice nav', 'blank note keeps the old note');
select lives_ok(
  $$ select public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('a',64), 'image/png', 1000, 10, 20, null, 'better note', 'shelf') $$,
  'duplicate with a note');
select is((select note from public.inspiration_items where content_hash = repeat('a',64)), 'better note', 'non-empty note replaces the old note');

select throws_ok(
  $$ select public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('b',64), 'image/gif', 1, 1, 1, null, null, 'web') $$,
  'P0001', 'unsupported_type', 'gif is not a stored type');

-- Room links: idempotent, editor-only, same-workspace-only.
select is(
  public.link_inspiration_to_room('e4000000-0000-4000-8000-000000000001', array[(select id from public.inspiration_items where content_hash = repeat('a',64))]),
  1, 'editor links an item');
select is(
  public.link_inspiration_to_room('e4000000-0000-4000-8000-000000000001', array[(select id from public.inspiration_items where content_hash = repeat('a',64))]),
  0, 'linking again is a no-op');
select throws_ok(
  $$ select public.link_inspiration_to_room('e4000000-0000-4000-8000-000000000002', array[(select id from public.inspiration_items where content_hash = repeat('a',64))]) $$,
  'P0001', 'not_authorized', 'cannot link into a room the user cannot edit (other workspace)');

-- Viewer: can see the item, cannot link.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000002',true);
select is((select count(*)::int from public.inspiration_items), 1, 'workspace member can read the library');
select throws_ok(
  $$ select public.link_inspiration_to_room('e4000000-0000-4000-8000-000000000001', array[(select id from public.inspiration_items where content_hash = repeat('a',64))]) $$,
  'P0001', 'not_authorized', 'view-only participant cannot link');

-- Outsider: sees nothing, cannot create intents.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000003',true);
select is((select count(*)::int from public.inspiration_items), 0, 'non-member sees no items');
select throws_ok(
  $$ select public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('c',64), 'image/png', 1, 1, 1, null, null, 'web') $$,
  'P0001', 'not_authorized', 'non-member cannot create an intent');

-- Owner: unlink then delete returns the storage path and cascades links.
select set_config('request.jwt.claim.sub','e1000000-0000-4000-8000-000000000001',true);
select is(
  public.unlink_inspiration_from_room('e4000000-0000-4000-8000-000000000001', array[(select id from public.inspiration_items where content_hash = repeat('a',64))]),
  1, 'editor unlinks an item');
select is(
  cardinality(public.delete_inspiration_items(array[(select id from public.inspiration_items where content_hash = repeat('a',64))])),
  1, 'delete returns one storage path');

reset role;
set local role anon;
select throws_ok(
  $$ select public.create_inspiration_intent('e2000000-0000-4000-8000-000000000001', repeat('d',64), 'image/png', 1, 1, 1, null, null, 'web') $$,
  '42501', null, 'anon cannot call the intent RPC');
reset role;

select * from finish();
rollback;
