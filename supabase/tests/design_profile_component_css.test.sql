begin;

create extension if not exists pgtap with schema extensions;

select plan(12);

select has_column(
  'public'::name,
  'design_system_profile_versions'::name,
  'component_css'::name,
  'design profile versions store component css'::text
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('97000000-0000-4000-8000-000000000001','authenticated','authenticated','component-css-owner@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  '98000000-0000-4000-8000-000000000001',
  'Component CSS Workspace',
  '97000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  '98000000-0000-4000-8000-000000000002',
  '98000000-0000-4000-8000-000000000001',
  'Component CSS Project',
  '97000000-0000-4000-8000-000000000001'
);
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  '98000000-0000-4000-8000-000000000003',
  '98000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000002',
  'Component CSS Room',
  '97000000-0000-4000-8000-000000000001'
);
insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values (
  '98000000-0000-4000-8000-000000000004','97000000-0000-4000-8000-000000000001','Owner Mac','macos',repeat('c',64),'active'
);
insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values (
  '97000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000004','codex','installed','authenticated','supported'
);
insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values (
  '97000000-0000-4000-8000-000000000001','98000000-0000-4000-8000-000000000004','codex'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '97000000-0000-4000-8000-000000000001',
  true
);

-- Task 1: payload includes componentCss.
select lives_ok(
  $$ select public.create_design_profile_distill_task(
    '98000000-0000-4000-8000-000000000003'
  ) $$,
  'an editor can queue profile distillation (with componentCss)'
);

reset role;
update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "profile": {
          "colors": [{"name":"primary","value":"#112233"}],
          "typeScale": [{"name":"body","px":16}],
          "spacing": [{"name":"md","px":16}],
          "radii": [{"name":"md","px":8}],
          "components": []
        },
        "tokenCss": ":root {}",
        "componentCss": ".ds-button{font-weight:600}"
      }
    }'
where kind = 'design_profile_distill'
  and status <> 'completed';

select is(
  (
    select version.component_css
    from public.design_profile_distills as distill
    join public.design_system_profile_versions as version
      on version.id = distill.version_id
  ),
  '.ds-button{font-weight:600}',
  'materialization writes component_css from the payload'
);

-- Stash the first version's id: both distills share one transaction-start
-- now(), so ordering by created_at can't distinguish the two rows below.
select set_config(
  'test.first_version_id',
  (select version_id::text from public.design_profile_distills),
  true
);

-- Task 2: payload omits componentCss entirely (back-compat).
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '97000000-0000-4000-8000-000000000001',
  true
);
select lives_ok(
  $$ select public.create_design_profile_distill_task(
    '98000000-0000-4000-8000-000000000003'
  ) $$,
  'an editor can queue profile distillation (without componentCss)'
);

reset role;
select lives_ok(
  $$ update public.ai_tasks
    set status = 'completed',
        result_json = '{
          "partial": false,
          "payload": {
            "profile": {
              "colors": [{"name":"primary","value":"#112233"}],
              "typeScale": [{"name":"body","px":16}],
              "spacing": [{"name":"md","px":16}],
              "radii": [{"name":"md","px":8}],
              "components": []
            },
            "tokenCss": ":root {}"
          }
        }'
    where kind = 'design_profile_distill'
      and status <> 'completed' $$,
  'materializing a payload without componentCss does not error'
);

select is(
  (
    select version.component_css
    from public.design_profile_distills as distill
    join public.design_system_profile_versions as version
      on version.id = distill.version_id
    where distill.version_id::text <> current_setting('test.first_version_id')
  ),
  null,
  'materialization leaves component_css null when the payload omits it'
);

select is(
  (select count(*)::integer from public.design_system_profile_versions),
  2,
  'both distill tasks materialized a profile version'
);

-- Regression guard: hydrate_authorized_room_context must NOT add
-- componentCss to designProfile, even when the active profile version has
-- a non-null component_css. AIContextPackageSchema.designProfile
-- (packages/contracts/src/ai.ts) is `.strict()` and only allows
-- { versionId, profile, tokenCss }; an extra key makes both the gateway
-- (safeParse) and the connector (parse) reject the whole hydrated context,
-- failing every design_screen_generate task for the workspace.
insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  '98000000-0000-4000-8000-000000000006',
  '98000000-0000-4000-8000-000000000003',
  '98000000-0000-4000-8000-000000000001',
  'Component CSS Screen',
  '97000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '97000000-0000-4000-8000-000000000001',
  true
);
select lives_ok(
  $$ select public.set_active_design_profile_version(
    current_setting('test.first_version_id')::uuid
  ) $$,
  'the profile version with a non-null component_css can be reactivated'
);
select lives_ok(
  $$ select public.create_design_screen_generate_task(
    '98000000-0000-4000-8000-000000000006'
  ) $$,
  'an editor can queue screen generation against a component_css profile'
);

reset role;
update public.ai_tasks
set status = 'running'
where kind = 'design_screen_generate';
insert into public.ai_task_attempts (
  id, task_id, device_id, attempt_no, lease_expires_at
)
values (
  '98000000-0000-4000-8000-000000000007',
  (select task_id from public.design_screen_generations),
  '98000000-0000-4000-8000-000000000004',
  1,
  now() + interval '90 seconds'
);

select is(
  (
    select version.component_css
    from public.design_screen_generations as generation
    join public.design_system_profile_versions as version
      on version.id = generation.profile_version_id
  ),
  '.ds-button{font-weight:600}',
  'the screen-generation task is pinned to the profile version with a non-null component_css'
);
select is(
  (
    public.hydrate_authorized_room_context(
      (select task_id from public.design_screen_generations),
      '98000000-0000-4000-8000-000000000007'
    ) #> '{context,designProfile}' ? 'componentCss'
  ),
  false,
  'screen-generation hydration does not leak componentCss into designProfile'
);
select is(
  public.hydrate_authorized_room_context(
    (select task_id from public.design_screen_generations),
    '98000000-0000-4000-8000-000000000007'
  ) #>> '{context,designProfile,tokenCss}',
  ':root {}',
  'screen-generation hydration still carries tokenCss'
);

select * from finish();
rollback;
