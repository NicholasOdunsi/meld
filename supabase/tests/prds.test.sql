begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

-- Four users, two orgs, one room owned by user A. User B is a view-only
-- member, user C is a workspace admin, and user D is an outsider.
insert into auth.users (id, aud, role, email, encrypted_password,
  email_confirmed_at, raw_app_meta_data, raw_user_meta_data, created_at, updated_at)
values
  ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','owner-a@example.com','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','viewer-b@example.com','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','admin-c@example.com','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now()),
  ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','outsider-d@example.com','',now(),'{"provider":"email","providers":["email"]}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values
  ('20000000-0000-4000-8000-000000000001','Org A','10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002','Org C','10000000-0000-4000-8000-000000000003');

insert into public.projects (id, workspace_id, name, created_by)
values
  ('70000000-0000-4000-8000-000000000007','20000000-0000-4000-8000-000000000001','Project A','10000000-0000-4000-8000-000000000001'),
  ('70000000-0000-4000-8000-000000000008','20000000-0000-4000-8000-000000000002','Project C','10000000-0000-4000-8000-000000000003');

-- Note: no explicit memberships insert here. Both users are creators of
-- their own orgs, and public.add_workspace_creator_membership() (an
-- after-insert trigger on workspaces) already inserted an 'admin'
-- membership row for each; inserting again would violate memberships_pkey.
-- Mirrors the idiom in ai_task_transitions.test.sql, which likewise never
-- re-inserts a creator's own membership.

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values ('40000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000007','Room A','10000000-0000-4000-8000-000000000001');

insert into public.memberships (workspace_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member'),
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','admin');

insert into public.room_participants (room_id, user_id, access, added_by)
values
(
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'view',
  '10000000-0000-4000-8000-000000000001'
),
(
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'view',
  '10000000-0000-4000-8000-000000000001'
);

-- A prd_generate task in the room, still running (result not yet set).
insert into public.execution_devices (id, user_id, name, platform, token_hash, status)
  values (
    '50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    'Owner Mac', 'macos', repeat('1', 64), 'active');
insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json, context_revision)
values (
  '60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','codex','prd_generate','running',
  'Generate a PRD','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb,0);

-- No PRD exists while the task is running.
select is((select count(*)::int from public.prds), 0, 'no prd before task completes');

-- Simulate settle_ai_task completion: status -> completed, result_json = envelope.
update public.ai_tasks
set status = 'completed',
    result_json = jsonb_build_object(
      'kind','prd_generate','partial',false,
      'payload', jsonb_build_object('title','Checkout redesign','executiveSummary','x'))
where id = '60000000-0000-4000-8000-000000000001';

-- Trigger materialized exactly one draft PRD at version 1.
select is((select count(*)::int from public.prds), 1, 'trigger inserts one prd on completion');
select is((select version from public.prds limit 1), 1, 'first prd is version 1');
select is((select status::text from public.prds limit 1), 'draft', 'prd status is draft');
select is((select document ->> 'title' from public.prds limit 1), 'Checkout redesign', 'document payload stored');
select is((select owner_id from public.prds limit 1), '10000000-0000-4000-8000-000000000001'::uuid, 'owner is room owner');

-- A second completed task bumps the version.
insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json, context_revision)
values (
  '60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','codex','prd_generate','running',
  'Regenerate','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb,0);
update public.ai_tasks set status='completed',
  result_json = jsonb_build_object('kind','prd_generate','partial',false,
    'payload', jsonb_build_object('title','Checkout redesign v2','executiveSummary','y'))
where id = '60000000-0000-4000-8000-000000000002';
select is((select max(version) from public.prds), 2, 'second completion is version 2');

-- A third completed task whose envelope has no "payload" key at all. The
-- trigger must not raise (result_json -> 'payload' is SQL NULL, not jsonb
-- null, so the guard needs an explicit `payload is null` check) and must
-- not materialize a row for it.
insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json, context_revision)
values (
  '60000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','codex','prd_generate','running',
  'Missing payload key','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb,0);

select lives_ok(
  $$
    update public.ai_tasks set status = 'completed',
      result_json = jsonb_build_object('kind','prd_generate','partial',false)
    where id = '60000000-0000-4000-8000-000000000003'
  $$,
  'a completed task with no payload key does not raise'
);
select is(
  (select count(*)::int from public.prds), 2,
  'a missing payload key materializes no additional prd'
);

-- REGRESSION: the real settle_ai_task path writes a completing task in TWO
-- updates -- transition_ai_task flips status running -> completed (result_json
-- still null), then a second update sets result_json. The trigger must
-- materialize on that second update even though the row is already 'completed'.
-- Every assertion above uses a single-update simulation, which could not catch
-- a trigger keying idempotency off old.status (the original bug).
insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json, context_revision)
values (
  '60000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','codex','prd_generate','running',
  'Two-step settle','{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb,0);
-- Step 1: status only (mirrors transition_ai_task); result_json still null.
update public.ai_tasks set status = 'completed'
  where id = '60000000-0000-4000-8000-000000000004';
-- Step 2: result_json arrives while the row is already 'completed'.
update public.ai_tasks set result_json = jsonb_build_object(
    'kind','prd_generate','partial',false,
    'payload', jsonb_build_object('title','Two-step PRD','executiveSummary','z'))
  where id = '60000000-0000-4000-8000-000000000004';
select is(
  (select count(*)::int from public.prds
     where source_task_id = '60000000-0000-4000-8000-000000000004'),
  1,
  'a two-step (status then result_json) settle materializes the prd'
);
select is(
  (select max(version) from public.prds
     where room_id = '40000000-0000-4000-8000-000000000001'),
  3,
  'the two-step materialized prd bumps to version 3'
);

-- RLS: a signed-in participant (owner) can read; an outsider cannot.
set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is((select count(*)::int from public.prds), 3, 'room participant sees all three prds');

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is((select count(*)::int from public.prds), 0, 'outsider sees no prds');

-- RLS/grants: authenticated has select-only; direct writes are rejected.
select throws_ok(
  $$
    insert into public.prds (
      room_id, workspace_id, version, status, document, owner_id)
    values (
      '40000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      99, 'draft', '{"title":"Hack"}'::jsonb,
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501', null,
  'authenticated cannot write prds directly'
);

-- Guarded editable versions and acceptance.
select ok(
  'accepted' = any(enum_range(null::public.prd_status)::text[]),
  'prd_status includes accepted'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prds' and column_name = 'created_by'
  ),
  'prds records the creator of each version'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prds' and column_name = 'accepted_at'
  ),
  'prds records acceptance time'
);
select ok(
  exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'prds' and column_name = 'accepted_by'
  ),
  'prds records the accepting user'
);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is(
  (select count(*)::int from public.prds
   where created_by = '10000000-0000-4000-8000-000000000001'::uuid),
  3,
  'generated versions record the room owner as creator'
);

select is(
  (select (public.save_prd_version(
    '40000000-0000-4000-8000-000000000001'::uuid,
    3,
    '{"title":"Edited checkout PRD","executiveSummary":"Updated"}'::jsonb
  )).version),
  3,
  'an editor updates the live draft without creating a version'
);
select is(
  (select created_by from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001' and version = 3),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'the live draft keeps its original creator'
);
select throws_ok(
  $$ select public.save_prd_version(
    '40000000-0000-4000-8000-000000000001'::uuid,
    3,
    '{}'::jsonb
  ) $$,
  'P0001',
  'invalid_prd_document',
  'a PRD version without a title is rejected'
);
select throws_ok(
  $$ select public.save_prd_version(
    '40000000-0000-4000-8000-000000000001'::uuid,
    2,
    '{"title":"Stale overwrite"}'::jsonb
  ) $$,
  'P0001',
  'prd_version_conflict',
  'a stale base version cannot overwrite the latest draft'
);

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.save_prd_version(
    '40000000-0000-4000-8000-000000000001'::uuid,
    3,
    '{"title":"Viewer overwrite"}'::jsonb
  ) $$,
  'P0001',
  'prd_edit_forbidden',
  'a view-only room participant cannot save a version'
);
select throws_ok(
  $$ select public.accept_prd_version(
    (select id from public.prds
     where room_id = '40000000-0000-4000-8000-000000000001' and version = 3)
  ) $$,
  'P0001',
  'prd_accept_forbidden',
  'a non-owner workspace member cannot accept a version'
);

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select is(
  (select (public.accept_prd_version(id)).status::text from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001' and version = 3),
  'accepted',
  'the room owner can accept a draft version'
);
select is(
  (select accepted_by from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001' and version = 3),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'owner acceptance records the accepting user'
);

select is(
  (select (public.save_prd_version(
    '40000000-0000-4000-8000-000000000001'::uuid,
    3,
    '{"title":"Admin acceptance PRD"}'::jsonb
  )).version),
  4,
  'the first edit after acceptance creates the next draft version'
);
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is(
  (select (public.accept_prd_version(id)).accepted_by from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001' and version = 4),
  '10000000-0000-4000-8000-000000000003'::uuid,
  'a workspace admin can accept a draft version'
);

-- The trigger is verified as the table owner so the test reaches the
-- immutable-row guard rather than the authenticated write revoke.
reset role;
select throws_ok(
  $$ update public.prds
     set document = '{"title":"Tampered"}'::jsonb
     where room_id = '40000000-0000-4000-8000-000000000001' and version = 3 $$,
  'P0001',
  'prd_accepted_immutable',
  'accepted document content is immutable'
);
select throws_ok(
  $$ delete from public.prds
     where room_id = '40000000-0000-4000-8000-000000000001' and version = 4 $$,
  'P0001',
  'prd_accepted_immutable',
  'accepted versions cannot be deleted'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select is(
  (select (public.accept_prd_version(id)).id from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001' and version = 4),
  (select id from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001' and version = 4),
  're-accepting an accepted version is a successful no-op'
);

-- Deleting a room is a deliberate, advertised destruction of everything in
-- it, so an accepted PRD must cascade away with its room. The delete guard
-- asserted above stops an accepted version being erased out from under a
-- live room; it must not also outlive the room. The guard distinguishes the
-- two by whether the parent row is still there, which is exactly how
-- protect_room_owner_participant already lets the participant cascade
-- through.
select set_config(
  'request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select lives_ok(
  $$ delete from public.rooms
     where id = '40000000-0000-4000-8000-000000000001' $$,
  'the owner can delete a room holding an accepted prd'
);

-- Counted as the table owner: the prds select policy keys off room
-- participation, so an authenticated count would read 0 whether or not the
-- cascade actually ran.
reset role;
select is(
  (select count(*)::int from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001'),
  0,
  'the accepted prd is removed with its room'
);

select * from finish();
rollback;
