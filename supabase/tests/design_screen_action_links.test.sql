begin;

create extension if not exists pgtap with schema extensions;

select plan(22);

select has_table(
  'public'::name,
  'design_screen_action_links'::name,
  'manual action-link overrides exist'::text
);
select col_is_pk(
  'public'::name,
  'design_screen_action_links'::name,
  array['screen_id'::name, 'action_id'::name],
  'one row exists per screen + action'::text
);
select ok(
  (
    select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.design_screen_action_links'::regclass
  ),
  'row level security is enabled on design_screen_action_links'
);
select ok(
  not has_table_privilege(
    'authenticated', 'public.design_screen_action_links', 'INSERT'
  ),
  'authenticated users cannot insert action links directly'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.set_design_screen_action_link(uuid, text, uuid)',
    'EXECUTE'
  ),
  'anonymous users cannot set action links'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.clear_design_screen_action_link(uuid, text)',
    'EXECUTE'
  ),
  'anonymous users cannot clear action links'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('96000000-0000-4000-8000-000000000001','authenticated','authenticated','link-owner@example.com','',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000002','authenticated','authenticated','link-viewer@example.com','',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000003','authenticated','authenticated','link-outsider@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  '97000000-0000-4000-8000-000000000001',
  'Link Workspace',
  '96000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  '98000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  'Link Project',
  '96000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values
  ('97000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','member'),
  ('97000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003','member');

-- Room A: the room under test. Room B: a second room used for the
-- cross-room rejection case.
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values
  ('99000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','Link Room A','96000000-0000-4000-8000-000000000001'),
  ('99000000-0000-4000-8000-000000000002','97000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000001','Link Room B','96000000-0000-4000-8000-000000000001');

-- The room owner is auto-added as an edit participant by
-- add_room_owner_participant, so only the extra viewer needs inserting.
insert into public.room_participants (room_id, user_id, access, added_by)
values
  ('99000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','view','96000000-0000-4000-8000-000000000001');

-- Screens A1, A2 live in room A; screen B1 lives in room B.
insert into public.design_screens (id, room_id, workspace_id, name, created_by)
values
  ('9a000000-0000-4000-8000-000000000001','99000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001','Screen A1','96000000-0000-4000-8000-000000000001'),
  ('9a000000-0000-4000-8000-000000000002','99000000-0000-4000-8000-000000000001','97000000-0000-4000-8000-000000000001','Screen A2','96000000-0000-4000-8000-000000000001'),
  ('9a000000-0000-4000-8000-000000000003','99000000-0000-4000-8000-000000000002','97000000-0000-4000-8000-000000000001','Screen B1','96000000-0000-4000-8000-000000000001');

set local role authenticated;

-- A view-only participant cannot set a link.
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.set_design_screen_action_link(
    '9a000000-0000-4000-8000-000000000001', 'go_next', '9a000000-0000-4000-8000-000000000002'
  ) $$,
  'P0001',
  'not_authorized',
  'a view-only participant cannot set an action link'
);

-- A non-participant cannot set a link.
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$ select public.set_design_screen_action_link(
    '9a000000-0000-4000-8000-000000000001', 'go_next', '9a000000-0000-4000-8000-000000000002'
  ) $$,
  'P0001',
  'not_authorized',
  'a non-participant cannot set an action link'
);

-- The room owner (an editor) can set and then clear a link.
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
select is(
  public.set_design_screen_action_link(
    '9a000000-0000-4000-8000-000000000001', 'go_next', '9a000000-0000-4000-8000-000000000002'
  ),
  true,
  'an editor sets an action link'
);
select is(
  (
    select target_screen_id from public.design_screen_action_links
    where screen_id = '9a000000-0000-4000-8000-000000000001' and action_id = 'go_next'
  ),
  '9a000000-0000-4000-8000-000000000002'::uuid,
  'the link points at the target screen'
);
select is(
  public.set_design_screen_action_link(
    '9a000000-0000-4000-8000-000000000001', 'go_next', '9a000000-0000-4000-8000-000000000002'
  ),
  true,
  're-setting the same link upserts rather than duplicating'
);
select is(
  (
    select count(*)::int from public.design_screen_action_links
    where screen_id = '9a000000-0000-4000-8000-000000000001' and action_id = 'go_next'
  ),
  1,
  'the upsert keeps exactly one row per screen + action'
);

-- Cross-room target is rejected.
select throws_ok(
  $$ select public.set_design_screen_action_link(
    '9a000000-0000-4000-8000-000000000001', 'go_other_room', '9a000000-0000-4000-8000-000000000003'
  ) $$,
  'P0001',
  'design_screen_cross_room',
  'a link to a screen in another room is rejected'
);

-- Self-link is rejected.
select throws_ok(
  $$ select public.set_design_screen_action_link(
    '9a000000-0000-4000-8000-000000000001', 'go_self', '9a000000-0000-4000-8000-000000000001'
  ) $$,
  'P0001',
  'design_screen_action_link_self',
  'a screen cannot link an action to itself'
);

-- A participant can read the link; an outsider (no room access) reads none.
select is(
  (select count(*)::int from public.design_screen_action_links),
  1,
  'a participant can read the action link'
);
set local role authenticated;
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000003',true);
select is(
  (select count(*)::int from public.design_screen_action_links),
  0,
  'a non-participant cannot read the action link'
);

-- clear_design_screen_action_link carries its own independent auth block
-- (not a shared helper with set_...), so exercise the same two rejection
-- cases against it directly rather than relying on set_...'s coverage.
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.clear_design_screen_action_link(
    '9a000000-0000-4000-8000-000000000001', 'go_next'
  ) $$,
  'P0001',
  'not_authorized',
  'a view-only participant cannot clear an action link'
);
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000003',true);
select throws_ok(
  $$ select public.clear_design_screen_action_link(
    '9a000000-0000-4000-8000-000000000001', 'go_next'
  ) $$,
  'P0001',
  'not_authorized',
  'a non-participant cannot clear an action link'
);

-- The editor clears the link.
select set_config('request.jwt.claim.sub','96000000-0000-4000-8000-000000000001',true);
select is(
  public.clear_design_screen_action_link(
    '9a000000-0000-4000-8000-000000000001', 'go_next'
  ),
  true,
  'an editor clears an existing link'
);
select is(
  (select count(*)::int from public.design_screen_action_links),
  0,
  'clearing removes the row'
);
select is(
  public.clear_design_screen_action_link(
    '9a000000-0000-4000-8000-000000000001', 'go_next'
  ),
  false,
  'clearing an action link that does not exist returns false'
);

-- Cascade on screen delete: re-create the link, then delete the target
-- screen and confirm the row is gone.
reset role;
select public.set_design_screen_action_link(
  '9a000000-0000-4000-8000-000000000001', 'go_next', '9a000000-0000-4000-8000-000000000002'
);
delete from public.design_screens where id = '9a000000-0000-4000-8000-000000000002';
select is(
  (select count(*)::int from public.design_screen_action_links),
  0,
  'deleting the target screen cascades to remove the link'
);

select * from finish();
rollback;
