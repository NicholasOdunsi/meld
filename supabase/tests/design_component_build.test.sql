-- A component build pass: it queues bounded batches, merges each settled
-- batch into a copy of the active design system, and only moves the
-- workspace's active pointer once the whole pass has finished.
--
-- Every settlement in this file is written the way `settle_ai_task` writes
-- one: TWO updates, the first flipping the status with `result_json` still
-- null and the second writing `result_json` without touching the status. A
-- single combined update is not how a task settles in production, and a
-- materializer that only works against the combined form works against
-- nothing -- which is the failure `202608020008_materialize_prd_two_step_settle.sql`
-- records for the PRD materializer.
--
-- Fixtures mirror `design_screen_chain.test.sql`. One editor, one device and
-- one provider connection are shared; each scenario gets its own workspace,
-- because only one pass may be open per workspace and several scenarios end
-- with a pass still open.

begin;

create extension if not exists pgtap with schema extensions;

select plan(41);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('e1000000-0000-4000-8000-000000000001','authenticated','authenticated','component-owner@example.com','',now(),'{}','{}',now(),now()),
  ('e1000000-0000-4000-8000-000000000002','authenticated','authenticated','component-editor@example.com','',now(),'{}','{}',now(),now());

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

-- A second editor whose device is paired to claude only -- no provider
-- connection, and no ai_user_preferences row, ever names codex. Scenario 6
-- proves the pass this editor starts runs on claude regardless of what
-- target_provider a caller passes.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('e1000000-0000-4000-8000-000000000004','authenticated','authenticated','component-claude-editor@example.com','',now(),'{}','{}',now(),now());
insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values (
  'e6000000-0000-4000-8000-000000000004',
  'e1000000-0000-4000-8000-000000000004',
  'Claude-only Mac',
  'macos',
  repeat('f', 64),
  'active'
);
insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values (
  'e1000000-0000-4000-8000-000000000004',
  'e6000000-0000-4000-8000-000000000004',
  'claude','installed','authenticated','supported'
);
insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values (
  'e1000000-0000-4000-8000-000000000004',
  'e6000000-0000-4000-8000-000000000004',
  'claude'
);

-- Five workspaces, each with a project, a room the editor may edit, and an
-- active design-system version. `n` is the scenario number and drives every
-- id, so a fixture can be read off its uuid.
do $$
declare
  n integer;
  workspace_id uuid;
  project_id uuid;
  room_id uuid;
begin
  for n in 1..5 loop
    workspace_id := ('e200000' || n::text || '-0000-4000-8000-000000000001')::uuid;
    project_id := ('e300000' || n::text || '-0000-4000-8000-000000000001')::uuid;
    room_id := ('e400000' || n::text || '-0000-4000-8000-000000000001')::uuid;

    insert into public.workspaces (id, name, created_by)
    values (workspace_id, 'Component Workspace ' || n::text,
      'e1000000-0000-4000-8000-000000000001');
    insert into public.projects (id, workspace_id, name, created_by)
    values (project_id, workspace_id, 'Component Project ' || n::text,
      'e1000000-0000-4000-8000-000000000001');
    insert into public.memberships (workspace_id, user_id, role)
    values (workspace_id, 'e1000000-0000-4000-8000-000000000002', 'member');
    insert into public.rooms (id, workspace_id, project_id, name, owner_id)
    values (room_id, workspace_id, project_id, 'Component Room ' || n::text,
      'e1000000-0000-4000-8000-000000000001');
    insert into public.room_participants (room_id, user_id, access, added_by)
    values (room_id, 'e1000000-0000-4000-8000-000000000002', 'edit',
      'e1000000-0000-4000-8000-000000000001');
  end loop;
end $$;

-- ---------------------------------------------------------------------------
-- Scenario 1: the ordinary pass. Two components the distiller built, one it
-- only described.
-- ---------------------------------------------------------------------------
insert into public.design_system_profile_versions (
  id, workspace_id, profile_json, token_css, component_css, created_by
)
values (
  'e7000001-0000-4000-8000-000000000001',
  'e2000001-0000-4000-8000-000000000001',
  '{
    "components": [
      {"name": "built_a", "html": "<div class=\"ds-built-a\"></div>", "css": ".ds-built-a { }"},
      {"name": "built_b", "html": "<div class=\"ds-built-b\"></div>", "css": ".ds-built-b { }"},
      {"name": "prose_c", "rules": "Inline, 12px, one accent border.", "description": "A quiet inline badge."}
    ]
  }'::jsonb,
  ':root { --ds-space: 8px; }',
  '.ds-built-a { }',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.design_system_profiles (workspace_id, active_version_id)
values (
  'e2000001-0000-4000-8000-000000000001',
  'e7000001-0000-4000-8000-000000000001'
);

select is(
  public.pending_design_components('e7000001-0000-4000-8000-000000000001'),
  array['prose_c'],
  'only components without markup are pending'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);

select lives_ok(
  $$ select public.start_design_component_build('e4000001-0000-4000-8000-000000000001', 'codex') $$,
  'an editor can start a component build pass'
);

reset role;

create temporary table pass1 as
select id, target_version_id
from public.design_component_build_passes
where workspace_id = 'e2000001-0000-4000-8000-000000000001';

select is(
  (select count(*)::integer from public.design_component_builds
    where pass_id = (select id from pass1)),
  1,
  'starting a pass queues exactly one batch'
);

select isnt(
  (select target_version_id from pass1),
  (select active_version_id from public.design_system_profiles
    where workspace_id = 'e2000001-0000-4000-8000-000000000001'),
  'the pass builds into a copy, not the live version'
);

select is(
  (select task.model from public.ai_tasks as task
    join public.design_component_builds as b on b.task_id = task.id
    where b.pass_id = (select id from pass1)),
  'gpt-5.4',
  'a build batch runs on the fast model tier, not the reasoning one'
);

-- The connector claims the batch, exactly as a dispatch does: the task is
-- moved to `ready_to_run` and then claimed, which is what creates the attempt
-- row `hydrate_authorized_room_context` authorizes against. Hydration is
-- invoked for real rather than pattern-matched out of the installed function
-- body, so these assertions describe behaviour rather than source text.
select public.transition_ai_task(
  (select task_id from public.design_component_builds
    where pass_id = (select id from pass1)),
  'ready_to_run',
  'queued'
);

create temporary table batch1_claim as
select public.claim_ai_task(
  (select task_id from public.design_component_builds
    where pass_id = (select id from pass1)),
  'e6000000-0000-4000-8000-000000000002'
) as payload;

create temporary table batch1_context as
select public.hydrate_authorized_room_context(
  (select (payload ->> 'taskId')::uuid from batch1_claim),
  (select (payload ->> 'attemptId')::uuid from batch1_claim)
) as hydrated;

select is(
  (select array_agg(entry.value ->> 'name' order by entry.ordinality)
     from batch1_context,
       lateral jsonb_array_elements(hydrated #> '{context,componentBuild,targets}')
         with ordinality as entry(value, ordinality)),
  array['prose_c'],
  'hydration names exactly the components this batch was asked to build'
);

select is(
  (select hydrated #>> '{context,componentBuild,targets,0,rules}' from batch1_context),
  'Inline, 12px, one accent border.',
  'hydration carries the prose rules the component is to be built from'
);

select is(
  (select hydrated #>> '{context,componentBuild,tokenCss}' from batch1_context),
  ':root { --ds-space: 8px; }',
  'hydration supplies the tokens to build against'
);

select is(
  (select array_agg(entry.value ->> 'name' order by entry.ordinality)
     from batch1_context,
       lateral jsonb_array_elements(hydrated #> '{context,componentBuild,references}')
         with ordinality as entry(value, ordinality)),
  array['built_a','built_b'],
  'hydration offers the already-built components as style references'
);

select is(
  (select hydrated #>> '{context,componentBuild,references,0,html}' from batch1_context),
  '<div class="ds-built-a"></div>',
  'a style reference carries the markup to match, not merely a name'
);

-- Settle the batch the way production settles one: status first, payload
-- second. The materializer must act on the SECOND update.
--
-- `running` as well as `queued`: the batch above was claimed, and a claimed
-- task is exactly what production settles.
update public.ai_tasks
set status = 'completed'
where kind = 'design_component_build' and status in ('queued', 'running');

update public.ai_tasks
set result_json = '{"partial":false,"payload":{"components":[{"name":"prose_c","html":"<div class=\"ds-prose-c\"></div>","css":".ds-prose-c { }"}]}}'
where kind = 'design_component_build' and result_json is null;

select is(
  public.pending_design_components(
    (select target_version_id from public.design_component_build_passes
      where workspace_id = 'e2000001-0000-4000-8000-000000000001')
  ),
  array[]::text[],
  'a completed batch merges its components into the target version'
);

-- "Nothing is pending" would also be true of a merge that threw the other two
-- components away, so assert what actually survived: every component, in the
-- distiller's order.
create temporary table merged_profile as
select version.profile_json as doc
from public.design_system_profile_versions as version
where version.id = (
  select target_version_id from public.design_component_build_passes
  where workspace_id = 'e2000001-0000-4000-8000-000000000001'
);

select is(
  (select array_agg(component ->> 'name' order by ordinality)
     from merged_profile,
       lateral jsonb_array_elements(doc -> 'components')
         with ordinality as entry(component, ordinality)),
  array['built_a','built_b','prose_c'],
  'the merge keeps every component, in the order the distiller listed them'
);

select is(
  (select array[component ->> 'description', component ->> 'html']
     from merged_profile,
       lateral jsonb_array_elements(doc -> 'components') as component
     where component ->> 'name' = 'prose_c'),
  array['A quiet inline badge.', '<div class="ds-prose-c"></div>'],
  'a built component keeps the prose it already had and gains its markup'
);

select is(
  (select component ->> 'html'
     from merged_profile,
       lateral jsonb_array_elements(doc -> 'components') as component
     where component ->> 'name' = 'built_a'),
  '<div class="ds-built-a"></div>',
  'a component the batch did not touch is left exactly as it was'
);

select is(
  (select active_version_id from public.design_system_profiles
    where workspace_id = 'e2000001-0000-4000-8000-000000000001'),
  (select target_version_id from public.design_component_build_passes
    where workspace_id = 'e2000001-0000-4000-8000-000000000001'),
  'finishing the last batch adopts the rebuilt version'
);

select isnt(
  (select completed_at from public.design_component_build_passes
    where workspace_id = 'e2000001-0000-4000-8000-000000000001'),
  null,
  'the pass is closed once nothing is left to build'
);

-- A second pass over a finished system has nothing to do.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select public.start_design_component_build('e4000001-0000-4000-8000-000000000001', 'codex');
reset role;

select is(
  (select count(*)::integer from public.ai_tasks
    where kind = 'design_component_build'
      and workspace_id = 'e2000001-0000-4000-8000-000000000001'),
  1,
  're-running builds only what is still missing'
);

-- ---------------------------------------------------------------------------
-- Scenario 2: a component that never validates is sent twice and then left as
-- prose.
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
  'e7000002-0000-4000-8000-000000000001',
  'e2000002-0000-4000-8000-000000000001',
  '{"components": [{"name": "never_builds", "description": "Refuses to validate."}]}'::jsonb,
  ':root { }',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.design_system_profiles (workspace_id, active_version_id)
values (
  'e2000002-0000-4000-8000-000000000001',
  'e7000002-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select public.start_design_component_build('e4000002-0000-4000-8000-000000000001', 'codex');
reset role;

create temporary table pass2 as
select id from public.design_component_build_passes
where workspace_id = 'e2000002-0000-4000-8000-000000000001';

-- Settle every queued batch as "completed, built nothing", more times than a
-- bounded retry could possibly need -- each in the two-update form.
do $$
declare settle_round integer;
begin
  for settle_round in 1..6 loop
    update public.ai_tasks
    set status = 'completed'
    where kind = 'design_component_build'
      and workspace_id = 'e2000002-0000-4000-8000-000000000001'
      and status = 'queued';

    update public.ai_tasks
    set result_json = '{"partial":false,"payload":{"components":[]}}'
    where kind = 'design_component_build'
      and workspace_id = 'e2000002-0000-4000-8000-000000000001'
      and result_json is null;
  end loop;
end $$;

select is(
  (select count(*)::integer from public.design_component_builds
    where pass_id = (select id from pass2)),
  2,
  'a component that never validates is sent twice and no more'
);

select isnt(
  (select completed_at from public.design_component_build_passes
    where id = (select id from pass2)),
  null,
  'the pass still closes, leaving what would not build as the prose it was'
);

-- ---------------------------------------------------------------------------
-- Scenario 3: a distillation that lands mid-pass is not overwritten.
--
-- `materialize_design_profile_distill` moves `active_version_id`
-- unconditionally. A pass that adopted its own copy without checking would
-- replace that brand new design system with a copy of the one it replaced.
-- ---------------------------------------------------------------------------
insert into public.design_system_profile_versions (
  id, workspace_id, profile_json, token_css, created_by
)
values (
  'e7000003-0000-4000-8000-000000000001',
  'e2000003-0000-4000-8000-000000000001',
  '{"components": [{"name": "prose_only", "description": "Needs building."}]}'::jsonb,
  ':root { }',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.design_system_profiles (workspace_id, active_version_id)
values (
  'e2000003-0000-4000-8000-000000000001',
  'e7000003-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select public.start_design_component_build('e4000003-0000-4000-8000-000000000001', 'codex');
reset role;

-- The person re-distils from a new reference while the batch is out. This is
-- exactly what the distill materializer does: a fresh version, and the pointer
-- moved onto it.
insert into public.design_system_profile_versions (
  id, workspace_id, profile_json, token_css, created_by
)
values (
  'e7000003-0000-4000-8000-000000000002',
  'e2000003-0000-4000-8000-000000000001',
  '{"components": [{"name": "redistilled", "html": "<div class=\"ds-redistilled\"></div>"}]}'::jsonb,
  ':root { --ds-new: 1; }',
  'e1000000-0000-4000-8000-000000000001'
);
update public.design_system_profiles
set active_version_id = 'e7000003-0000-4000-8000-000000000002', updated_at = now()
where workspace_id = 'e2000003-0000-4000-8000-000000000001';

update public.ai_tasks
set status = 'completed'
where kind = 'design_component_build'
  and workspace_id = 'e2000003-0000-4000-8000-000000000001'
  and status = 'queued';

update public.ai_tasks
set result_json = '{"partial":false,"payload":{"components":[{"name":"prose_only","html":"<div class=\"ds-prose-only\"></div>"}]}}'
where kind = 'design_component_build'
  and workspace_id = 'e2000003-0000-4000-8000-000000000001'
  and result_json is null;

select is(
  (select active_version_id from public.design_system_profiles
    where workspace_id = 'e2000003-0000-4000-8000-000000000001'),
  'e7000003-0000-4000-8000-000000000002'::uuid,
  'a distillation that lands mid-pass keeps the pointer -- the pass does not overwrite it'
);

select isnt(
  (select completed_at from public.design_component_build_passes
    where workspace_id = 'e2000003-0000-4000-8000-000000000001'),
  null,
  'the pass still closes, rather than sitting open over a base nobody is using'
);

-- ---------------------------------------------------------------------------
-- Scenario 4: pressing the button twice, and resuming after a failure.
--
-- Six prose-only components, so the pass needs more than one batch.
-- ---------------------------------------------------------------------------
insert into public.design_system_profile_versions (
  id, workspace_id, profile_json, token_css, created_by
)
values (
  'e7000004-0000-4000-8000-000000000001',
  'e2000004-0000-4000-8000-000000000001',
  (select jsonb_build_object(
     'components',
     jsonb_agg(jsonb_build_object('name', 'c' || n::text) order by n)
   ) from generate_series(1, 6) as n),
  ':root { }',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.design_system_profiles (workspace_id, active_version_id)
values (
  'e2000004-0000-4000-8000-000000000001',
  'e7000004-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select public.start_design_component_build('e4000004-0000-4000-8000-000000000001', 'codex')
  as id into temporary first_start;
reset role;

-- The button pressed again while the first batch is still queued.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select public.start_design_component_build('e4000004-0000-4000-8000-000000000001', 'codex')
  as id into temporary second_start;
reset role;

select is(
  (select count(*)::integer from public.design_component_builds
    where pass_id = (select id from first_start)),
  1,
  'pressing the button again while a batch is in flight queues nothing new'
);

select is(
  (select id from second_start),
  (select id from first_start),
  'the second press resumes the open pass rather than starting another'
);

-- That batch fails. Production writes a failure in two updates too: the status
-- first, then the error.
update public.ai_tasks
set status = 'failed'
where kind = 'design_component_build'
  and workspace_id = 'e2000004-0000-4000-8000-000000000001'
  and status = 'queued';

update public.ai_tasks
set error_code = 'provider_unavailable', error_message = 'gone'
where kind = 'design_component_build'
  and workspace_id = 'e2000004-0000-4000-8000-000000000001'
  and error_code is null;

select is(
  (select completed_at from public.design_component_build_passes
    where id = (select id from first_start)),
  null,
  'a failed batch leaves the pass open rather than closing it'
);

select is(
  (select active_version_id from public.design_system_profiles
    where workspace_id = 'e2000004-0000-4000-8000-000000000001'),
  'e7000004-0000-4000-8000-000000000001'::uuid,
  'a failed batch leaves the live design system exactly where it was'
);

-- Now the button again: the open pass resumes and re-sends what is missing.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select public.start_design_component_build('e4000004-0000-4000-8000-000000000001', 'codex')
  as id into temporary third_start;
reset role;

select is(
  (select count(*)::integer from public.design_component_builds
    where pass_id = (select id from first_start)),
  2,
  'resuming a pass whose batch failed queues the next batch'
);

select is(
  (select id from third_start),
  (select id from first_start),
  'the resumed pass is the same pass, not a new one'
);

-- That resumed batch succeeds, so there is a real merge to try to repeat.
update public.ai_tasks
set status = 'completed'
where kind = 'design_component_build'
  and workspace_id = 'e2000004-0000-4000-8000-000000000001'
  and status = 'queued';

update public.ai_tasks
set result_json = '{"partial":false,"payload":{"components":[{"name":"c1","html":"<i>1</i>"},{"name":"c2","html":"<i>2</i>"},{"name":"c3","html":"<i>3</i>"},{"name":"c4","html":"<i>4</i>"}]}}'
where kind = 'design_component_build'
  and workspace_id = 'e2000004-0000-4000-8000-000000000001'
  and status = 'completed'
  and result_json is null;

create temporary table w4_after_merge as
select count(*)::integer as versions
from public.design_system_profile_versions
where workspace_id = 'e2000004-0000-4000-8000-000000000001';

-- A settled task row gets touched again for all sorts of reasons -- a lease
-- reclaim, an `updated_at` bump, a later column write. `materialized_at` is
-- what stops each of those replaying the merge and forking off another
-- version of the profile.
update public.ai_tasks
set updated_at = now()
where id = (
  select task_id from public.design_component_builds
  where pass_id = (select id from first_start)
    and merged_version_id is not null
);

select is(
  (select count(*)::integer from public.design_system_profile_versions
    where workspace_id = 'e2000004-0000-4000-8000-000000000001'),
  (select versions from w4_after_merge),
  'a batch is merged exactly once, however often its task row is touched again'
);

-- The version hydration reads. That merge appended a NEW profile version and
-- advanced `target_version_id` onto it, so the pass's target is no longer the
-- copy it started from -- in that copy not one of c1..c6 had any markup at
-- all. The next batch (c5, c6) is claimed and hydrated here, and the style
-- references it receives can only be c1..c3 if hydration read the pass's
-- CURRENT version. Read the version the pass started from and `references`
-- comes back empty.
select isnt(
  (select target_version_id from public.design_component_build_passes
    where id = (select id from first_start)),
  (select source_version_id from public.design_component_build_passes
    where id = (select id from first_start)),
  'the merge moved the pass forward onto a newer version than it started from'
);

select public.transition_ai_task(
  (select task_id from public.design_component_builds
    where pass_id = (select id from first_start) and 'c5' = any(component_names)),
  'ready_to_run',
  'queued'
);

create temporary table batch3_claim as
select public.claim_ai_task(
  (select task_id from public.design_component_builds
    where pass_id = (select id from first_start) and 'c5' = any(component_names)),
  'e6000000-0000-4000-8000-000000000002'
) as payload;

create temporary table batch3_context as
select public.hydrate_authorized_room_context(
  (select (payload ->> 'taskId')::uuid from batch3_claim),
  (select (payload ->> 'attemptId')::uuid from batch3_claim)
) as hydrated;

select is(
  (select array_agg(entry.value ->> 'name' order by entry.ordinality)
     from batch3_context,
       lateral jsonb_array_elements(hydrated #> '{context,componentBuild,targets}')
         with ordinality as entry(value, ordinality)),
  array['c5','c6'],
  'a later batch is asked to build only what is still missing'
);

select is(
  (select array_agg(entry.value ->> 'name' order by entry.ordinality)
     from batch3_context,
       lateral jsonb_array_elements(hydrated #> '{context,componentBuild,references}')
         with ordinality as entry(value, ordinality)),
  array['c1','c2','c3'],
  'hydration reads the version the pass is on now -- a later batch matches the components an earlier one built, capped at three'
);

select is(
  (select hydrated #>> '{context,componentBuild,references,0,css}' from batch3_context),
  '',
  'a reference built without css still carries css as a string, never null'
);

-- ---------------------------------------------------------------------------
-- Scenario 5: a payload that is not the shape the merge expects, and a
-- cancelled batch.
--
-- This trigger runs AFTER UPDATE on `ai_tasks`, so anything it raises aborts
-- `settle_ai_task` -- the connector could not settle the task at all and the
-- run would wedge with no way to clear it. Garbage in must mean "merged
-- nothing", never "could not settle".
-- ---------------------------------------------------------------------------
insert into public.design_system_profile_versions (
  id, workspace_id, profile_json, token_css, created_by
)
values (
  'e7000005-0000-4000-8000-000000000001',
  'e2000005-0000-4000-8000-000000000001',
  (select jsonb_build_object(
     'components',
     jsonb_agg(jsonb_build_object('name', 'd' || n::text) order by n)
   ) from generate_series(1, 5) as n),
  ':root { }',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.design_system_profiles (workspace_id, active_version_id)
values (
  'e2000005-0000-4000-8000-000000000001',
  'e7000005-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000002', true);
select public.start_design_component_build('e4000005-0000-4000-8000-000000000001', 'codex')
  as id into temporary pass5;
reset role;

create temporary table batch5_first as
select task_id from public.design_component_builds
where pass_id = (select id from pass5);

update public.ai_tasks
set status = 'completed'
where id = (select task_id from batch5_first);

-- `components` is a string, and what entries there are are not objects.
-- Neither may reach `jsonb_array_elements` unguarded.
select lives_ok(
  $$ update public.ai_tasks
     set result_json = '{"partial":false,"payload":{"components":"not-an-array"}}'
     where kind = 'design_component_build' and result_json is null $$,
  'a malformed payload still settles -- the trigger does not raise into settle_ai_task'
);

select is(
  (select merged_version_id from public.design_component_builds
    where task_id = (select task_id from batch5_first)),
  null,
  'a malformed payload merges nothing'
);

select is(
  (select count(*)::integer from public.design_component_builds
    where pass_id = (select id from pass5)),
  2,
  'the pass still advances past a batch it could not merge'
);

-- The retry is cancelled by the person. The pass stays open and the live
-- design system is untouched.
update public.ai_tasks
set status = 'cancelled'
where kind = 'design_component_build'
  and workspace_id = 'e2000005-0000-4000-8000-000000000001'
  and status = 'queued';

update public.ai_tasks
set cancelled_at = now()
where kind = 'design_component_build'
  and workspace_id = 'e2000005-0000-4000-8000-000000000001'
  and cancelled_at is null;

select is(
  (select completed_at from public.design_component_build_passes
    where id = (select id from pass5)),
  null,
  'a cancelled batch leaves the pass open'
);

select is(
  (select active_version_id from public.design_system_profiles
    where workspace_id = 'e2000005-0000-4000-8000-000000000001'),
  'e7000005-0000-4000-8000-000000000001'::uuid,
  'a cancelled batch leaves the live design system exactly where it was'
);

-- ---------------------------------------------------------------------------
-- Scenario 6: a Claude-only device asks to start a pass with target_provider
-- = 'codex'. queue_design_component_build_batch inserts straight into
-- ai_tasks, bypassing create_ai_task's own device/provider compatibility
-- check -- so before this fix the pass's provider column, and every batch it
-- queues, followed the caller's argument rather than the device that will
-- actually run it. Both must resolve to claude: the only provider this
-- editor's device is connected to.
-- ---------------------------------------------------------------------------
insert into public.workspaces (id, name, created_by)
values (
  'e2000006-0000-4000-8000-000000000001',
  'Component Workspace 6',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  'e3000006-0000-4000-8000-000000000001',
  'e2000006-0000-4000-8000-000000000001',
  'Component Project 6',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values (
  'e2000006-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000004',
  'member'
);
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  'e4000006-0000-4000-8000-000000000001',
  'e2000006-0000-4000-8000-000000000001',
  'e3000006-0000-4000-8000-000000000001',
  'Component Room 6',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values (
  'e4000006-0000-4000-8000-000000000001',
  'e1000000-0000-4000-8000-000000000004',
  'edit',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.design_system_profile_versions (
  id, workspace_id, profile_json, token_css, created_by
)
values (
  'e7000006-0000-4000-8000-000000000001',
  'e2000006-0000-4000-8000-000000000001',
  '{"components": [{"name": "prose_a", "rules": "Inline, 12px, one accent border."}]}'::jsonb,
  ':root { }',
  'e1000000-0000-4000-8000-000000000001'
);
insert into public.design_system_profiles (workspace_id, active_version_id)
values (
  'e2000006-0000-4000-8000-000000000001',
  'e7000006-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub', 'e1000000-0000-4000-8000-000000000004', true);
select lives_ok(
  $$ select public.start_design_component_build('e4000006-0000-4000-8000-000000000001', 'codex') $$,
  'a claude-only editor can start a pass even when passing target_provider = codex'
);
reset role;

select is(
  (select provider from public.design_component_build_passes
    where workspace_id = 'e2000006-0000-4000-8000-000000000001'),
  'claude'::public.ai_provider,
  'the pass runs on the caller''s connected provider, not the passed-in argument'
);
select is(
  (select provider from public.ai_tasks
    where kind = 'design_component_build'
      and workspace_id = 'e2000006-0000-4000-8000-000000000001'),
  'claude'::public.ai_provider,
  'the queued batch is pinned to the resolved provider, not the passed-in argument'
);
select is(
  (select device_id from public.ai_tasks
    where kind = 'design_component_build'
      and workspace_id = 'e2000006-0000-4000-8000-000000000001'),
  'e6000000-0000-4000-8000-000000000004'::uuid,
  'the queued batch is pinned to the device that reported the resolved provider'
);

select * from finish();
rollback;
