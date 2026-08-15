-- Materializing a multi-screen generation batch: `materialize_design_screen_generate()`
-- fans `result_json.payload.screens[]` out into N `design_screen` rows/versions,
-- resolving/creating each by `screen_key`, and still supports the legacy
-- single-screen payload shape. Fixtures mirror `design_task_rpcs.test.sql`.

begin;

create extension if not exists pgtap with schema extensions;

select plan(27);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('aa000000-0000-4000-8000-000000000001','authenticated','authenticated','batch-owner@example.com','',now(),'{}','{}',now(),now()),
  ('aa000000-0000-4000-8000-000000000002','authenticated','authenticated','batch-editor@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  'ab000000-0000-4000-8000-000000000001',
  'Batch Workspace',
  'aa000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  'ac000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'Batch Project',
  'aa000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values ('ab000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000002','member');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  'ad000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'ac000000-0000-4000-8000-000000000001',
  'Batch Room',
  'aa000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values ('ad000000-0000-4000-8000-000000000001','aa000000-0000-4000-8000-000000000002','edit','aa000000-0000-4000-8000-000000000001');

insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  'ae000000-0000-4000-8000-000000000001',
  'ad000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'Screen A',
  'aa000000-0000-4000-8000-000000000002'
);

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values ('af000000-0000-4000-8000-000000000002','aa000000-0000-4000-8000-000000000002','Editor Mac','macos',repeat('c',64),'active');
insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values ('aa000000-0000-4000-8000-000000000002','af000000-0000-4000-8000-000000000002','codex','installed','authenticated','supported');
insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values ('aa000000-0000-4000-8000-000000000002','af000000-0000-4000-8000-000000000002','codex');

-- ---------------------------------------------------------------------------
-- Section 1: a two-screen batch materializes two screens by screen_key.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('ae000000-0000-4000-8000-000000000001');

reset role;
create temporary table task1_ref as
select task_id from public.design_screen_generations
where screen_id = 'ae000000-0000-4000-8000-000000000001';
grant select on task1_ref to authenticated;

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "screens": [
          {
            "screenKey": "landing",
            "markup": "<main>Landing</main>",
            "styles": "main { display: block; }",
            "script": null,
            "actions": [{"id": "go-confirm", "label": "Continue", "targetScreenKey": "confirm"}]
          },
          {
            "screenKey": "confirm",
            "markup": "<main>Confirm</main>",
            "styles": "main { display: block; }",
            "script": null,
            "actions": [{"id": "go-landing", "label": "Back", "targetScreenKey": "landing"}]
          }
        ]
      }
    }'
where id = (select task_id from task1_ref);

select is(
  (select count(*)::integer from public.design_screens),
  2,
  'a two-screen batch materializes two screens'
);
select is(
  (select screen_key from public.design_screens where id = 'ae000000-0000-4000-8000-000000000001'),
  'landing',
  'the originating screen takes the first element''s key'
);
select is(
  (
    select screen_key from public.design_screens
    where room_id = 'ad000000-0000-4000-8000-000000000001'
      and id <> 'ae000000-0000-4000-8000-000000000001'
  ),
  'confirm',
  'a new screen is created for the second element, keyed by screenKey'
);
select is(
  (
    select canvas_x from public.design_screens
    where screen_key = 'confirm'
  ),
  460::double precision,
  'the new screen is laid out at the next free canvas_x'
);
select is(
  (select count(*)::integer from public.design_screen_versions where originating_task_id = (select task_id from task1_ref)),
  2,
  'one version is written per batch screen'
);
select is(
  (select count(*)::integer from public.design_screen_versions where originating_task_id = (select task_id from task1_ref) and promoted),
  2,
  'both batch versions are promoted (fresh screens have no conflicting base)'
);
select is(
  (
    select version.actions_json -> 0 ->> 'targetScreenKey'
    from public.design_screen_versions as version
    where version.screen_id = 'ae000000-0000-4000-8000-000000000001'
  ),
  'confirm',
  'the originating screen''s action persists targetScreenKey'
);
select is(
  (
    select version.actions_json -> 0 ->> 'targetScreenKey'
    from public.design_screen_versions as version
    join public.design_screens as screen on screen.id = version.screen_id
    where screen.screen_key = 'confirm'
  ),
  'landing',
  'the new screen''s action persists targetScreenKey'
);
select is(
  (
    select count(*)::integer from public.design_screen_events
    where kind in ('version_created', 'version_promoted')
  ),
  4,
  'materialization appends created and promoted events per screen'
);

-- get_design_screen_generation's join was patched to add
-- `version.screen_id = generation.screen_id` so a task with N batch
-- versions still resolves to the ORIGINATING screen's row, not an arbitrary
-- one. Exercise it directly against the two-version task above.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select is(
  (
    select count(*)::integer
    from public.get_design_screen_generation((select task_id from task1_ref))
  ),
  1,
  'get_design_screen_generation returns exactly one row for a batch task'
);
select is(
  (
    select screen_id
    from public.get_design_screen_generation((select task_id from task1_ref))
  ),
  'ae000000-0000-4000-8000-000000000001',
  'get_design_screen_generation resolves the originating screen, not the second batch screen'
);
select is(
  (
    select version_id
    from public.get_design_screen_generation((select task_id from task1_ref))
  ),
  (
    select version.id
    from public.design_screen_versions as version
    where version.screen_id = 'ae000000-0000-4000-8000-000000000001'
      and version.originating_task_id = (select task_id from task1_ref)
  ),
  'get_design_screen_generation resolves the originating screen''s own version, not the confirm screen''s'
);
reset role;

-- ---------------------------------------------------------------------------
-- Section 2: a follow-up task re-using an existing screenKey updates that
-- screen in place -- no duplicate row, key stays stable.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('ae000000-0000-4000-8000-000000000001');

reset role;
create temporary table task2_ref as
select task_id from public.design_screen_generations
where screen_id = 'ae000000-0000-4000-8000-000000000001'
  and task_id <> (select task_id from task1_ref);

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "screens": [
          {
            "screenKey": "landing",
            "markup": "<main>Landing v2</main>",
            "styles": "main { display: block; }",
            "script": null,
            "actions": [{"id": "go-confirm", "label": "Continue", "targetScreenKey": "confirm"}]
          },
          {
            "screenKey": "confirm",
            "markup": "<main>Confirm v2</main>",
            "styles": "main { display: block; }",
            "script": null,
            "actions": [{"id": "go-landing", "label": "Back", "targetScreenKey": "landing"}]
          }
        ]
      }
    }'
where id = (select task_id from task2_ref);

select is(
  (select count(*)::integer from public.design_screens),
  2,
  'a follow-up batch reusing existing keys creates no duplicate rows'
);
select is(
  (select screen_key from public.design_screens where screen_key = 'confirm'),
  'confirm',
  'the reused screenKey is preserved (stable, not re-derived)'
);
select is(
  (select count(*)::integer from public.design_screen_versions),
  4,
  'the follow-up batch adds one new version per screen'
);
select is(
  (
    select version.markup
    from public.design_screen_versions as version
    join public.design_screens as screen on screen.id = version.screen_id
    where screen.screen_key = 'confirm'
      and version.id = screen.current_version_id
  ),
  '<main>Confirm v2</main>',
  'the follow-up version becomes the confirm screen''s current version'
);
select is(
  (
    select version.promoted
    from public.design_screen_versions as version
    join public.design_screens as screen on screen.id = version.screen_id
    where screen.screen_key = 'confirm'
      and version.id = screen.current_version_id
  ),
  true,
  'the follow-up version for an existing screen promotes cleanly'
);
select is(
  (
    select count(*)::integer
    from public.design_screen_versions as version
    join public.design_screens as screen on screen.id = version.screen_id
    where screen.screen_key = 'confirm'
  ),
  2,
  'the confirm screen now has two versions total (one per task)'
);

-- ---------------------------------------------------------------------------
-- Section 3: a legacy single-screen payload (no `screens` array) still
-- materializes exactly one screen.
-- ---------------------------------------------------------------------------

insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  'ae000000-0000-4000-8000-000000000003',
  'ad000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'Screen C',
  'aa000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('ae000000-0000-4000-8000-000000000003');

reset role;
create temporary table task3_ref as
select task_id from public.design_screen_generations
where screen_id = 'ae000000-0000-4000-8000-000000000003';

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "markup": "<main>Legacy</main>",
        "styles": "main { display: block; }",
        "script": null,
        "actions": []
      }
    }'
where id = (select task_id from task3_ref);

select is(
  (select count(*)::integer from public.design_screens),
  3,
  'a legacy single-screen payload materializes no additional screens'
);
select is(
  (select count(*)::integer from public.design_screen_versions where screen_id = 'ae000000-0000-4000-8000-000000000003'),
  1,
  'the legacy payload writes exactly one version'
);
select is(
  (select promoted from public.design_screen_versions where screen_id = 'ae000000-0000-4000-8000-000000000003'),
  true,
  'the legacy single-screen version promotes'
);

-- ---------------------------------------------------------------------------
-- Section 4: a screenKey collision with a *different* live screen never
-- points two screens at one key.
-- ---------------------------------------------------------------------------

insert into public.design_screens (
  id, room_id, workspace_id, name, screen_key, created_by
)
values (
  'ae000000-0000-4000-8000-000000000005',
  'ad000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'Screen E',
  'shared',
  'aa000000-0000-4000-8000-000000000002'
);
insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  'ae000000-0000-4000-8000-000000000004',
  'ad000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'Screen D',
  'aa000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('ae000000-0000-4000-8000-000000000004');

reset role;
create temporary table task4_ref as
select task_id from public.design_screen_generations
where screen_id = 'ae000000-0000-4000-8000-000000000004';

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "screens": [
          {
            "screenKey": "shared",
            "markup": "<main>Screen D</main>",
            "styles": "main { display: block; }",
            "script": null,
            "actions": []
          }
        ]
      }
    }'
where id = (select task_id from task4_ref);

select is(
  (select count(*)::integer from public.design_screens),
  5,
  'a colliding key never creates a duplicate screen'
);
select is(
  (select screen_key from public.design_screens where id = 'ae000000-0000-4000-8000-000000000004'),
  null,
  'a colliding key is not claimed by the originating screen'
);
select is(
  (select screen_key from public.design_screens where id = 'ae000000-0000-4000-8000-000000000005'),
  'shared',
  'the pre-existing screen keeps its own key'
);
select is(
  (select count(*)::integer from public.design_screen_versions where screen_id = 'ae000000-0000-4000-8000-000000000004'),
  1,
  'materialization still succeeds for the colliding screen'
);
select is(
  (select promoted from public.design_screen_versions where screen_id = 'ae000000-0000-4000-8000-000000000004'),
  true,
  'the colliding screen''s version still promotes'
);

-- ---------------------------------------------------------------------------
-- Section 5: replay safety extends to batches (the guard checks any version
-- for the task, not a fixed count).
-- ---------------------------------------------------------------------------

update public.ai_tasks set updated_at = now()
where id = (select task_id from task1_ref);

select is(
  (select count(*)::integer from public.design_screen_versions where originating_task_id = (select task_id from task1_ref)),
  2,
  'batch materialization is replay-safe'
);

select * from finish();
rollback;
