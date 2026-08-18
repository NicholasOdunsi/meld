-- Persisting the generated page name to design_screens.name.
--
-- The connector emits `result_json.payload.screens[].name` per screen.
-- `materialize_design_screen_generate()` writes that name onto the resolved
-- screen row ONLY when the screen's current name is exactly the default
-- placeholder `'Screen'` -- a hand-typed name (e.g. "Login") or a
-- flow-seeded name is left untouched. A forward-referenced sibling (a
-- screenKey with no existing row) is inserted fresh with the model's name.
-- Fixtures mirror `design_screen_batch_materialize.test.sql`.

begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('e0000000-0000-4000-8000-000000000001','authenticated','authenticated','name-owner@example.com','',now(),'{}','{}',now(),now()),
  ('e0000000-0000-4000-8000-000000000002','authenticated','authenticated','name-editor@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  'e1000000-0000-4000-8000-000000000001',
  'Name Workspace',
  'e0000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  'e2000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'Name Project',
  'e0000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values ('e1000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','member');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  'e3000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'Name Room',
  'e0000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values ('e3000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','edit','e0000000-0000-4000-8000-000000000001');

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values ('e4000000-0000-4000-8000-000000000001','e0000000-0000-4000-8000-000000000002','Editor Mac','macos',repeat('d',64),'active');
insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values ('e0000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000001','codex','installed','authenticated','supported');
insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values ('e0000000-0000-4000-8000-000000000002','e4000000-0000-4000-8000-000000000001','codex');

-- ---------------------------------------------------------------------------
-- Section 1: a screen created with the default placeholder name 'Screen'
-- takes on the model's declared name when it generates.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000002', true);
create temporary table screen1_ref as
select (public.create_design_screen('e3000000-0000-4000-8000-000000000001', 'Screen')).id as id;
select public.create_design_screen_generate_task((select id from screen1_ref));

reset role;
create temporary table task1_ref as
select task_id from public.design_screen_generations
where screen_id = (select id from screen1_ref);

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "screens": [
          {
            "screenKey": "vehicle_pool",
            "name": "Vehicle Pool",
            "formFactor": "mobile",
            "markup": "<main></main>",
            "styles": "",
            "script": null,
            "actions": [],
            "layout": null
          }
        ]
      }
    }'
where id = (select task_id from task1_ref);

select is(
  (select name from public.design_screens where id = (select id from screen1_ref)),
  'Vehicle Pool',
  'a screen named the default placeholder "Screen" takes the generated name'
);

-- ---------------------------------------------------------------------------
-- Section 2: a screen pre-named something other than the placeholder is
-- never overwritten by generation, no matter what name the model declares.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000002', true);
create temporary table screen2_ref as
select (public.create_design_screen('e3000000-0000-4000-8000-000000000001', 'Login')).id as id;
select public.create_design_screen_generate_task((select id from screen2_ref));

reset role;
create temporary table task2_ref as
select task_id from public.design_screen_generations
where screen_id = (select id from screen2_ref);

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "screens": [
          {
            "screenKey": "login",
            "name": "Vehicle Pool",
            "formFactor": "mobile",
            "markup": "<main></main>",
            "styles": "",
            "script": null,
            "actions": [],
            "layout": null
          }
        ]
      }
    }'
where id = (select task_id from task2_ref);

select is(
  (select name from public.design_screens where id = (select id from screen2_ref)),
  'Login',
  'a screen pre-named something other than the default placeholder keeps its name'
);

-- ---------------------------------------------------------------------------
-- Section 3: a forward-referenced sibling -- a screenKey matching no
-- existing row -- is inserted fresh with the model's declared name.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e0000000-0000-4000-8000-000000000002', true);
create temporary table screen3_ref as
select (public.create_design_screen('e3000000-0000-4000-8000-000000000001', 'Screen')).id as id;
select public.create_design_screen_generate_task((select id from screen3_ref));

reset role;
create temporary table task3_ref as
select task_id from public.design_screen_generations
where screen_id = (select id from screen3_ref);

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "screens": [
          {
            "screenKey": "origin",
            "name": "Origin",
            "formFactor": "mobile",
            "markup": "<main></main>",
            "styles": "",
            "script": null,
            "actions": [],
            "layout": null
          },
          {
            "screenKey": "vehicle_pool_sibling",
            "name": "Vehicle Pool",
            "formFactor": "mobile",
            "markup": "<main></main>",
            "styles": "",
            "script": null,
            "actions": [],
            "layout": null
          }
        ]
      }
    }'
where id = (select task_id from task3_ref);

select is(
  (
    select name from public.design_screens
    where room_id = 'e3000000-0000-4000-8000-000000000001'
      and screen_key = 'vehicle_pool_sibling'
  ),
  'Vehicle Pool',
  'a forward-referenced sibling is inserted fresh with the model''s declared name'
);
select is(
  (select name from public.design_screens where id = (select id from screen3_ref)),
  'Origin',
  'the originating screen in the same batch also takes its declared name'
);

select * from finish();
rollback;
