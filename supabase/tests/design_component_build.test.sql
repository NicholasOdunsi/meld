-- A component build pass: it queues bounded batches, merges each settled
-- batch into a copy of the active design system, and only moves the
-- workspace's active pointer once the whole pass has finished.
--
-- Fixtures mirror `design_screen_chain.test.sql`: one workspace, one project,
-- one room, an editor with a paired device and a connected provider, and one
-- active profile version whose three components are two with markup and one
-- that exists only as prose.

begin;

create extension if not exists pgtap with schema extensions;

select plan(11);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','component-owner@example.com','',now(),'{}','{}',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','authenticated','authenticated','component-editor@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  'e2000000-0000-4000-8000-000000000001',
  'Component Workspace',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  'e3000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'Component Project',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values ('e2000000-0000-4000-8000-000000000001','e1000000-0000-4000-8000-000000000002','member');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  'e4000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  'e3000000-0000-4000-8000-000000000001',
  'Component Room',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values (
  'e4000000-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000002',
  'edit',
  'e1000000-0000-4000-8000-000000000001'
);

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values (
  'e6000000-0000-4000-8000-000000000002',
  'e1000000-0000-4000-8000-000000000002',
  'Editor Mac',
  'macos',
  repeat('e', 64),
  'active'
);
insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values (
  'e1000000-0000-4000-8000-000000000002',
  'e6000000-0000-4000-8000-000000000002',
  'codex','installed','authenticated','supported'
);
insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values (
  'e1000000-0000-4000-8000-000000000002',
  'e6000000-0000-4000-8000-000000000002',
  'codex'
);

-- Two components the distiller built, one it only described.
insert into public.design_system_profile_versions (
  id, workspace_id, profile_json, token_css, component_css, created_by
)
values (
  'e7000000-0000-4000-8000-000000000001',
  'e2000000-0000-4000-8000-000000000001',
  '{
    "components": [
      {"name": "built_a", "html": "<div class=\"ds-built-a\"></div>", "css": ".ds-built-a { }"},
      {"name": "built_b", "html": "<div class=\"ds-built-b\"></div>", "css": ".ds-built-b { }"},
      {"name": "prose_c", "description": "A quiet inline badge."}
    ]
  }'::jsonb,
  ':root { --ds-space: 8px; }',
  '.ds-built-a { }',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.design_system_profiles (workspace_id, active_version_id)
values (
  'e2000000-0000-4000-8000-000000000001',
  'e7000000-0000-4000-8000-000000000001'
);

select is(
  public.pending_design_components('e7000000-0000-4000-8000-000000000001'),
  array['prose_c'],
  'only components without markup are pending'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$ select public.start_design_component_build('e4000000-0000-4000-8000-000000000001', 'codex') $$,
  'an editor can start a component build pass'
);

reset role;

select is(
  (select count(*)::integer from public.ai_tasks where kind = 'design_component_build'),
  1,
  'starting a pass queues exactly one batch'
);

select isnt(
  (select target_version_id from public.design_component_build_passes limit 1),
  (select active_version_id from public.design_system_profiles limit 1),
  'the pass builds into a copy, not the live version'
);

select is(
  (select model from public.ai_tasks where kind = 'design_component_build' limit 1),
  'gpt-5.4',
  'a build batch runs on the fast model tier, not the reasoning one'
);

-- Settle the batch with a built component.
update public.ai_tasks
set status = 'completed',
    result_json = '{"partial":false,"payload":{"components":[{"name":"prose_c","html":"<div class=\"ds-prose-c\"></div>","css":".ds-prose-c { }"}]}}'
where kind = 'design_component_build';

select is(
  public.pending_design_components(
    (select target_version_id from public.design_component_build_passes limit 1)
  ),
  array[]::text[],
  'a completed batch merges its components into the target version'
);

select is(
  (select active_version_id from public.design_system_profiles limit 1),
  (select target_version_id from public.design_component_build_passes limit 1),
  'finishing the last batch adopts the rebuilt version'
);

select isnt(
  (select completed_at from public.design_component_build_passes limit 1),
  null,
  'the pass is closed once nothing is left to build'
);

-- A second pass over a finished system has nothing to do.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select public.start_design_component_build('e4000000-0000-4000-8000-000000000001', 'codex');
reset role;

select is(
  (select count(*)::integer from public.ai_tasks where kind = 'design_component_build'),
  1,
  're-running builds only what is still missing'
);

-- ---------------------------------------------------------------------------
-- A component that never validates is sent twice and then left as prose.
--
-- The retry decision is made from the batch just settled ("this was attempt
-- 1, so try again"), but the next batch is chosen from what is still missing
-- -- and a component that never builds is still missing for ever. Without a
-- per-component ceiling the pass alternated attempt 1, attempt 2, attempt 1
-- ... queueing a model run every time and never closing.
-- ---------------------------------------------------------------------------
insert into public.design_system_profile_versions (
  id, workspace_id, profile_json, token_css, created_by
)
values (
  'e7000000-0000-4000-8000-000000000002',
  'e2000000-0000-4000-8000-000000000001',
  '{"components": [{"name": "never_builds", "description": "Refuses to validate."}]}'::jsonb,
  ':root { }',
  'e1000000-0000-4000-8000-000000000001'
);
update public.design_system_profiles
set active_version_id = 'e7000000-0000-4000-8000-000000000002'
where workspace_id = 'e2000000-0000-4000-8000-000000000001';

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select public.start_design_component_build('e4000000-0000-4000-8000-000000000001', 'codex');
reset role;

-- Every pass in this file shares one transaction timestamp, so the newest is
-- not identifiable by `created_at`. The source version it copied is.
create temporary table stubborn_pass as
select id from public.design_component_build_passes
where source_version_id = 'e7000000-0000-4000-8000-000000000002';

-- Settle every queued batch as "completed, built nothing", more times than a
-- bounded retry could possibly need.
do $$
declare settle_round integer;
begin
  for settle_round in 1..6 loop
    update public.ai_tasks
    set status = 'completed',
        result_json = '{"partial":false,"payload":{"components":[]}}'
    where kind = 'design_component_build' and status = 'queued';
  end loop;
end $$;

select is(
  (select count(*)::integer from public.design_component_builds
    where pass_id = (select id from stubborn_pass)),
  2,
  'a component that never validates is sent twice and no more'
);

select isnt(
  (select completed_at from public.design_component_build_passes
    where id = (select id from stubborn_pass)),
  null,
  'the pass still closes, leaving what would not build as the prose it was'
);

select * from finish();
rollback;
