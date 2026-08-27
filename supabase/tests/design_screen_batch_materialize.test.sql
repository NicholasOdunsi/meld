-- Materializing a multi-screen generation batch: `materialize_design_screen_generate()`
-- fans `result_json.payload.screens[]` out into N `design_screen` rows/versions,
-- resolving/creating each by `screen_key`, and still supports the legacy
-- single-screen payload shape. Fixtures mirror `design_task_rpcs.test.sql`.

begin;

create extension if not exists pgtap with schema extensions;

select plan(38);

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
-- Section 4: nothing was selected, so the originating screen is an empty
-- placeholder, and the model declares the key of a screen that already exists.
-- That declaration means "this IS that screen": the version lands on the
-- incumbent and the placeholder is retired.
--
-- This reverses Policy A for placeholders, deliberately. Under Policy A the
-- placeholder claimed the key and the incumbent had its key stripped, which in
-- practice meant asking to change an unselected screen produced a second copy
-- of it and left the original unreachable -- observed live as two "Vehicle
-- Detail" screens with eight buttons silently re-pointed at the new one.
-- Section 4b covers the case Policy A was written for and still holds there.
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
  (
    select count(*)::integer from public.design_screens
    where room_id = 'ad000000-0000-4000-8000-000000000001' and deleted_at is null
  ),
  4,
  'the declared key resolves to the existing screen instead of adding another'
);
select is(
  (select screen_key from public.design_screens where id = 'ae000000-0000-4000-8000-000000000005'),
  'shared',
  'the incumbent keeps the key -- every button pointing at it still resolves'
);
select is(
  (select count(*)::integer from public.design_screen_versions where screen_id = 'ae000000-0000-4000-8000-000000000005'),
  1,
  'the generated version lands on the screen that owns the key'
);
select is(
  (
    select version.markup
    from public.design_screen_versions as version
    join public.design_screens as screen on screen.id = version.screen_id
    where screen.id = 'ae000000-0000-4000-8000-000000000005'
      and version.id = screen.current_version_id
  ),
  '<main>Screen D</main>',
  'and becomes its current version, so the update is what you see'
);
select is(
  (select deleted_at is not null from public.design_screens where id = 'ae000000-0000-4000-8000-000000000004'),
  true,
  'the unused placeholder is retired rather than left empty on the canvas'
);
select is(
  (
    select screen_id from public.design_screen_generations
    where task_id = (select task_id from task4_ref)
  ),
  'ae000000-0000-4000-8000-000000000005',
  'the generation is repointed, so the reply previews the screen that changed'
);

-- ---------------------------------------------------------------------------
-- Section 4b: the same collision, but the originating screen was SELECTED --
-- it already has content. Policy A still applies: the person was looking at
-- this screen and asked for a change, so the version belongs here whatever key
-- the model names, and the incumbent yields to keep the key unique.
-- ---------------------------------------------------------------------------

insert into public.design_screens (
  id, room_id, workspace_id, name, screen_key, created_by
)
values (
  'ae000000-0000-4000-8000-000000000008',
  'ad000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'Screen H',
  'held',
  'aa000000-0000-4000-8000-000000000002'
);
insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  'ae000000-0000-4000-8000-000000000009',
  'ad000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'Screen I',
  'aa000000-0000-4000-8000-000000000002'
);
-- Give Screen I real content, which is what makes it a selection rather than
-- a placeholder.
insert into public.design_screen_versions (
  id, screen_id, room_id, markup, styles, actions_json, promoted, created_by
)
values (
  'b0000000-0000-4000-8000-000000000001',
  'ae000000-0000-4000-8000-000000000009',
  'ad000000-0000-4000-8000-000000000001',
  '<main>Screen I v1</main>',
  'main { display: block; }',
  '[]'::jsonb,
  true,
  'aa000000-0000-4000-8000-000000000002'
);
update public.design_screens
set current_version_id = 'b0000000-0000-4000-8000-000000000001'
where id = 'ae000000-0000-4000-8000-000000000009';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('ae000000-0000-4000-8000-000000000009');

reset role;
create temporary table task4b_ref as
select task_id from public.design_screen_generations
where screen_id = 'ae000000-0000-4000-8000-000000000009';

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "screens": [
          {
            "screenKey": "held",
            "markup": "<main>Screen I v2</main>",
            "styles": "main { display: block; }",
            "script": null,
            "actions": []
          }
        ]
      }
    }'
where id = (select task_id from task4b_ref);

select is(
  (select screen_key from public.design_screens where id = 'ae000000-0000-4000-8000-000000000009'),
  'held',
  'a selected screen still claims the key it declares (Policy A)'
);
select is(
  (select screen_key from public.design_screens where id = 'ae000000-0000-4000-8000-000000000008'),
  null,
  'the displaced incumbent yields, so no two live screens share one key'
);
select is(
  (select deleted_at is not null from public.design_screens where id = 'ae000000-0000-4000-8000-000000000009'),
  false,
  'a selected screen is never retired as a placeholder'
);
select is(
  (
    select count(*)::integer from public.design_screen_versions
    where screen_id = 'ae000000-0000-4000-8000-000000000009'
  ),
  2,
  'the new version lands on the selected screen, on top of the one it had'
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

-- ---------------------------------------------------------------------------
-- Section 6: a screen element's "layout" field fans out to design_layouts --
-- "create" resolves-or-creates a keyed layout and points the screen at it,
-- "reuse" on a later, unrelated screen points at that same layout without
-- creating a second one.
-- ---------------------------------------------------------------------------

insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  'ae000000-0000-4000-8000-000000000006',
  'ad000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'Screen F',
  'aa000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('ae000000-0000-4000-8000-000000000006');

reset role;
create temporary table task6_ref as
select task_id from public.design_screen_generations
where screen_id = 'ae000000-0000-4000-8000-000000000006';

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "screens": [
          {
            "screenKey": "shell-page",
            "markup": "<main>Shell Page</main>",
            "styles": "main { display: block; }",
            "script": null,
            "actions": [],
            "layout": {
              "create": {
                "layoutKey": "app-shell",
                "name": "App Shell",
                "shellMarkup": "<aside>nav</aside><main data-meld-slot></main>",
                "shellStyles": "aside{display:block}",
                "actions": [{"id": "nav-home", "label": "Home", "targetScreenKey": "home"}]
              }
            }
          }
        ]
      }
    }'
where id = (select task_id from task6_ref);

select is(
  (select count(*)::integer from public.design_layouts where layout_key = 'app-shell'),
  1,
  'a design_layouts row is created keyed app-shell'
);
select is(
  (
    select version.shell_markup
    from public.design_layout_versions as version
    join public.design_layouts as layout on layout.id = version.layout_id
    where layout.layout_key = 'app-shell'
  ),
  '<aside>nav</aside><main data-meld-slot></main>',
  'its version''s shell_markup matches'
);
select ok(
  (
    (select layout_id from public.design_screens where id = 'ae000000-0000-4000-8000-000000000006') is not null
    and (select layout_id from public.design_screens where id = 'ae000000-0000-4000-8000-000000000006')
      = (select id from public.design_layouts where layout_key = 'app-shell')
  ),
  'the originating screen''s layout_id points at that layout'
);

insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  'ae000000-0000-4000-8000-000000000007',
  'ad000000-0000-4000-8000-000000000001',
  'ab000000-0000-4000-8000-000000000001',
  'Screen G',
  'aa000000-0000-4000-8000-000000000002'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('ae000000-0000-4000-8000-000000000007');

reset role;
create temporary table task7_ref as
select task_id from public.design_screen_generations
where screen_id = 'ae000000-0000-4000-8000-000000000007';

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "screens": [
          {
            "screenKey": "other-page",
            "markup": "<main>Other Page</main>",
            "styles": "main { display: block; }",
            "script": null,
            "actions": [],
            "layout": {
              "reuse": {"layoutKey": "app-shell"}
            }
          }
        ]
      }
    }'
where id = (select task_id from task7_ref);

select ok(
  (
    (select layout_id from public.design_screens where id = 'ae000000-0000-4000-8000-000000000007') is not null
    and (select layout_id from public.design_screens where id = 'ae000000-0000-4000-8000-000000000007')
      = (select id from public.design_layouts where layout_key = 'app-shell')
    and (select count(*)::integer from public.design_layouts where layout_key = 'app-shell') = 1
  ),
  'a second task reusing the layoutKey points the new screen at the same layout, without creating a new one'
);

-- ---------------------------------------------------------------------------
-- Section 7: a "create" declaring a DIFFERENT key than any layout the screen
-- currently uses must never rename/overwrite a layout other screens still
-- share -- it creates a brand new layout row and leaves the shared one
-- (still referenced by Screen G from Section 6) completely untouched.
-- ---------------------------------------------------------------------------

create temporary table app_shell_before as
select id, layout_key, current_version_id from public.design_layouts where layout_key = 'app-shell';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('ae000000-0000-4000-8000-000000000006');

reset role;
create temporary table task8_ref as
select task_id from public.design_screen_generations
where screen_id = 'ae000000-0000-4000-8000-000000000006'
  and task_id <> (select task_id from task6_ref);

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "screens": [
          {
            "screenKey": "shell-page",
            "markup": "<main>Shell Page v2</main>",
            "styles": "main { display: block; }",
            "script": null,
            "actions": [],
            "layout": {
              "create": {
                "layoutKey": "auth-shell",
                "name": "Auth Shell",
                "shellMarkup": "<aside>auth nav</aside><main data-meld-slot></main>",
                "shellStyles": "aside{display:block}",
                "actions": []
              }
            }
          }
        ]
      }
    }'
where id = (select task_id from task8_ref);

select ok(
  (
    (select count(*)::integer from public.design_layouts where layout_key = 'auth-shell') = 1
    and (select layout_id from public.design_screens where id = 'ae000000-0000-4000-8000-000000000006')
      = (select id from public.design_layouts where layout_key = 'auth-shell')
    and (select layout_id from public.design_screens where id = 'ae000000-0000-4000-8000-000000000006')
      <> (select id from app_shell_before)
    and (select layout_key from public.design_layouts where id = (select id from app_shell_before)) = 'app-shell'
    and (select current_version_id from public.design_layouts where id = (select id from app_shell_before))
      is not distinct from (select current_version_id from app_shell_before)
  ),
  'a create declaring a different key creates a new layout and leaves the original shared layout unchanged'
);

-- ---------------------------------------------------------------------------
-- Section 8: a "create" declaring the SAME key as an existing live layout
-- writes a new version onto that same layout row (the intended "edit the
-- shell, every screen using it updates" behavior) rather than a duplicate.
-- ---------------------------------------------------------------------------

create temporary table app_shell_before2 as
select id, current_version_id from public.design_layouts where layout_key = 'app-shell';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'aa000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('ae000000-0000-4000-8000-000000000007');

reset role;
create temporary table task9_ref as
select task_id from public.design_screen_generations
where screen_id = 'ae000000-0000-4000-8000-000000000007'
  and task_id <> (select task_id from task7_ref);

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "screens": [
          {
            "screenKey": "other-page",
            "markup": "<main>Other Page v2</main>",
            "styles": "main { display: block; }",
            "script": null,
            "actions": [],
            "layout": {
              "create": {
                "layoutKey": "app-shell",
                "name": "App Shell",
                "shellMarkup": "<aside>nav v2</aside><main data-meld-slot></main>",
                "shellStyles": "aside{display:block}",
                "actions": []
              }
            }
          }
        ]
      }
    }'
where id = (select task_id from task9_ref);

select ok(
  (
    (select count(*)::integer from public.design_layouts where layout_key = 'app-shell') = 1
    and (select id from public.design_layouts where layout_key = 'app-shell') = (select id from app_shell_before2)
    and (select current_version_id from public.design_layouts where layout_key = 'app-shell')
      is distinct from (select current_version_id from app_shell_before2)
    and (
      select version.shell_markup
      from public.design_layout_versions as version
      join public.design_layouts as layout on layout.id = version.layout_id
      where layout.layout_key = 'app-shell'
        and version.id = layout.current_version_id
    ) = '<aside>nav v2</aside><main data-meld-slot></main>'
  ),
  'a create declaring an existing key writes a new version onto that same layout row, not a duplicate'
);

select * from finish();
rollback;
