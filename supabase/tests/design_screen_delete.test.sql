begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('9b000000-0000-4000-8000-000000000001','authenticated','authenticated','delete-owner@example.com','',now(),'{}','{}',now(),now()),
  ('9b000000-0000-4000-8000-000000000002','authenticated','authenticated','delete-editor@example.com','',now(),'{}','{}',now(),now()),
  ('9b000000-0000-4000-8000-000000000003','authenticated','authenticated','delete-viewer@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  '9c000000-0000-4000-8000-000000000001',
  'Delete Workspace',
  '9b000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  '9d000000-0000-4000-8000-000000000001',
  '9c000000-0000-4000-8000-000000000001',
  'Delete Project',
  '9b000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values
  ('9c000000-0000-4000-8000-000000000001','9b000000-0000-4000-8000-000000000002','member'),
  ('9c000000-0000-4000-8000-000000000001','9b000000-0000-4000-8000-000000000003','member');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  '9e000000-0000-4000-8000-000000000001',
  '9c000000-0000-4000-8000-000000000001',
  '9d000000-0000-4000-8000-000000000001',
  'Delete Room',
  '9b000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values
  ('9e000000-0000-4000-8000-000000000001','9b000000-0000-4000-8000-000000000002','edit','9b000000-0000-4000-8000-000000000001'),
  ('9e000000-0000-4000-8000-000000000001','9b000000-0000-4000-8000-000000000003','view','9b000000-0000-4000-8000-000000000001');

insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values
  (
    '9f000000-0000-4000-8000-000000000001',
    '9e000000-0000-4000-8000-000000000001',
    '9c000000-0000-4000-8000-000000000001',
    'Viewer Target',
    '9b000000-0000-4000-8000-000000000001'
  ),
  (
    '9f000000-0000-4000-8000-000000000002',
    '9e000000-0000-4000-8000-000000000001',
    '9c000000-0000-4000-8000-000000000001',
    'Editor Target',
    '9b000000-0000-4000-8000-000000000001'
  );

set local role authenticated;

-- A view-access participant cannot delete a screen.
select set_config(
  'request.jwt.claim.sub',
  '9b000000-0000-4000-8000-000000000003',
  true
);
select throws_ok(
  $$ select public.delete_design_screen('9f000000-0000-4000-8000-000000000001') $$,
  'P0001',
  'not_authorized',
  'a view-access participant cannot delete a screen'
);
select is(
  (select deleted_at from public.design_screens where id = '9f000000-0000-4000-8000-000000000001'),
  null,
  'the rejected delete leaves deleted_at unset'
);

-- An edit-access participant can delete a screen; it soft-deletes.
select set_config(
  'request.jwt.claim.sub',
  '9b000000-0000-4000-8000-000000000002',
  true
);
select lives_ok(
  $$ select public.delete_design_screen('9f000000-0000-4000-8000-000000000002') $$,
  'an editor can delete a screen'
);
select isnt(
  (select deleted_at from public.design_screens where id = '9f000000-0000-4000-8000-000000000002'),
  null,
  'deleting sets deleted_at'
);

-- The read policy already scopes to deleted_at is null at the callsite, but
-- the row itself must still be readable (soft delete, not hard delete) so an
-- explicit is(...) on the row's own state is the meaningful assertion here --
-- exercised above via deleted_at. Re-deleting is a no-op, not an error.
select lives_ok(
  $$ select public.delete_design_screen('9f000000-0000-4000-8000-000000000002') $$,
  'deleting an already-deleted screen is idempotent'
);

-- Deleting a screen that doesn't exist is rejected the same way as
-- unauthorized access, matching delete_design_reference's behavior.
select throws_ok(
  $$ select public.delete_design_screen('00000000-0000-4000-8000-000000000000') $$,
  'P0001',
  'not_authorized',
  'deleting a non-existent screen is rejected'
);

-- restore_design_screen is delete's undo path (the canvas calls it when
-- tldraw's own undo stack brings a just-deleted frame back).
select set_config(
  'request.jwt.claim.sub',
  '9b000000-0000-4000-8000-000000000003',
  true
);
select throws_ok(
  $$ select public.restore_design_screen('9f000000-0000-4000-8000-000000000002') $$,
  'P0001',
  'not_authorized',
  'a view-access participant cannot restore a screen'
);

select set_config(
  'request.jwt.claim.sub',
  '9b000000-0000-4000-8000-000000000002',
  true
);
select lives_ok(
  $$ select public.restore_design_screen('9f000000-0000-4000-8000-000000000002') $$,
  'an editor can restore a deleted screen'
);
select is(
  (select deleted_at from public.design_screens where id = '9f000000-0000-4000-8000-000000000002'),
  null,
  'restoring clears deleted_at'
);
select lives_ok(
  $$ select public.restore_design_screen('9f000000-0000-4000-8000-000000000002') $$,
  'restoring a screen that was never deleted is idempotent'
);

select * from finish();
rollback;
