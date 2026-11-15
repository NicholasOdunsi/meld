begin;
create extension if not exists pgtap with schema extensions;
select plan(7);

insert into auth.users (id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('ee000000-0000-4000-8000-000000000001','authenticated','authenticated','canvas-owner@example.com','',now(),'{}','{}',now(),now()),
  ('ee000000-0000-4000-8000-000000000002','authenticated','authenticated','canvas-viewer@example.com','',now(),'{}','{}',now(),now()),
  ('ee000000-0000-4000-8000-000000000003','authenticated','authenticated','canvas-outsider@example.com','',now(),'{}','{}',now(),now());
insert into public.workspaces (id, name, created_by)
values ('ee000000-0000-4000-8000-000000000010','Canvas Workspace','ee000000-0000-4000-8000-000000000001');
insert into public.projects (id, workspace_id, name, created_by)
values ('ee000000-0000-4000-8000-000000000011','ee000000-0000-4000-8000-000000000010','Canvas Project','ee000000-0000-4000-8000-000000000001');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values ('ee000000-0000-4000-8000-000000000012','ee000000-0000-4000-8000-000000000010',
  'ee000000-0000-4000-8000-000000000011','Canvas Room','ee000000-0000-4000-8000-000000000001');
insert into public.memberships (workspace_id, user_id, role)
values ('ee000000-0000-4000-8000-000000000010','ee000000-0000-4000-8000-000000000002','member');
insert into public.room_participants (room_id, user_id, access, added_by)
values ('ee000000-0000-4000-8000-000000000012','ee000000-0000-4000-8000-000000000002','view','ee000000-0000-4000-8000-000000000001');

select has_table('public', 'room_excalidraw_boards', 'room board table exists');
set local role authenticated;
select set_config('request.jwt.claim.sub', 'ee000000-0000-4000-8000-000000000001', true);
select is(
  public.save_room_excalidraw_board('ee000000-0000-4000-8000-000000000012', 4,
    '{"version":1,"elements":[],"screens":[]}'::jsonb)->>'status',
  'conflict', 'missing board cannot be created from a stale revision');
select is(
  public.save_room_excalidraw_board('ee000000-0000-4000-8000-000000000012', 0,
    '{"version":1,"elements":[],"screens":[]}'::jsonb)->>'status',
  'saved', 'editor creates the room board');
select is(
  public.save_room_excalidraw_board('ee000000-0000-4000-8000-000000000012', 0,
    '{"version":1,"elements":[],"screens":[]}'::jsonb)->>'status',
  'conflict', 'stale revision cannot overwrite');
select set_config('request.jwt.claim.sub', 'ee000000-0000-4000-8000-000000000002', true);
select is((select count(*)::integer from public.room_excalidraw_boards), 1, 'viewer can read');
select throws_ok($$select public.save_room_excalidraw_board('ee000000-0000-4000-8000-000000000012', 1,
  '{"version":1,"elements":[],"screens":[]}'::jsonb)$$, 'P0001', 'not_authorized', 'viewer cannot save');
select set_config('request.jwt.claim.sub', 'ee000000-0000-4000-8000-000000000003', true);
select is((select count(*)::integer from public.room_excalidraw_boards), 0, 'outsider cannot read');

select * from finish();
rollback;
