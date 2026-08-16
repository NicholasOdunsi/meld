begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('96000000-0000-4000-8000-000000000001','authenticated','authenticated','restore-owner@example.com','',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000002','authenticated','authenticated','restore-editor@example.com','',now(),'{}','{}',now(),now()),
  ('96000000-0000-4000-8000-000000000003','authenticated','authenticated','restore-viewer@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  '97000000-0000-4000-8000-000000000001',
  'Restore Workspace',
  '96000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  '98000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  'Restore Project',
  '96000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values
  ('97000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','member'),
  ('97000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003','member');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  '99000000-0000-4000-8000-000000000001',
  '97000000-0000-4000-8000-000000000001',
  '98000000-0000-4000-8000-000000000001',
  'Restore Room',
  '96000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values
  ('99000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','edit','96000000-0000-4000-8000-000000000001'),
  ('99000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000003','view','96000000-0000-4000-8000-000000000001');

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values (
  '9a000000-0000-4000-8000-000000000001','96000000-0000-4000-8000-000000000002','Editor Mac','macos',repeat('a',64),'active'
);
insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values (
  '96000000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000001','codex','installed','authenticated','supported'
);
insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values (
  '96000000-0000-4000-8000-000000000002','9a000000-0000-4000-8000-000000000001','codex'
);

insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values
  (
    'a0000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-000000000001',
    'Restore Screen',
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    'a0000000-0000-4000-8000-000000000002',
    '99000000-0000-4000-8000-000000000001',
    '97000000-0000-4000-8000-000000000001',
    'Other Screen',
    '96000000-0000-4000-8000-000000000001'
  );

insert into public.design_screen_versions (
  id, screen_id, room_id, markup, styles, script, actions_json,
  promoted, created_by
)
values
  (
    'a1000000-0000-4000-8000-000000000001',
    'a0000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',
    '<main>V0</main>', 'main { color: red; }', null, '[]', true,
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    'a1000000-0000-4000-8000-000000000002',
    'a0000000-0000-4000-8000-000000000001',
    '99000000-0000-4000-8000-000000000001',
    '<main>V1</main>', 'main { color: blue; }', null, '[]', false,
    '96000000-0000-4000-8000-000000000001'
  ),
  (
    'a1000000-0000-4000-8000-000000000003',
    'a0000000-0000-4000-8000-000000000002',
    '99000000-0000-4000-8000-000000000001',
    '<main>Other</main>', '', null, '[]', true,
    '96000000-0000-4000-8000-000000000001'
  );

update public.design_screens
set current_version_id = 'a1000000-0000-4000-8000-000000000001',
    state = 'built'
where id = 'a0000000-0000-4000-8000-000000000001';
update public.design_screens
set current_version_id = 'a1000000-0000-4000-8000-000000000003',
    state = 'built'
where id = 'a0000000-0000-4000-8000-000000000002';

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-4000-8000-000000000002',
  true
);

-- The typed instruction is trimmed and stored verbatim on the created task.
-- The RPC call and the follow-up read are kept as separate statements: a
-- single statement's snapshot cannot see the insert its own function call
-- just performed.
select public.create_design_screen_generate_task(
  'a0000000-0000-4000-8000-000000000001',
  'codex',
  'make a login screen'
);
select is(
  (
    select task.instruction
    from public.ai_tasks as task
    join public.design_screen_generations as generation
      on generation.task_id = task.id
    where generation.screen_id = 'a0000000-0000-4000-8000-000000000001'
  ),
  'make a login screen',
  'the typed instruction is stored on the created task'
);

-- An editor restoring V0 appends a new, promoted version copied from V0.
select lives_ok(
  $$ select public.restore_design_screen_version(
    'a0000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001'
  ) $$,
  'an editor can restore a prior version'
);
select is(
  (
    select count(*)::integer from public.design_screen_versions
    where screen_id = 'a0000000-0000-4000-8000-000000000001'
  ),
  3,
  'restore appends a third version'
);
select is(
  (
    select markup from public.design_screen_versions
    where screen_id = 'a0000000-0000-4000-8000-000000000001'
      and id not in (
        'a1000000-0000-4000-8000-000000000001',
        'a1000000-0000-4000-8000-000000000002'
      )
  ),
  '<main>V0</main>',
  'the restored version copies V0''s markup'
);
select is(
  (
    select promoted from public.design_screen_versions
    where screen_id = 'a0000000-0000-4000-8000-000000000001'
      and id not in (
        'a1000000-0000-4000-8000-000000000001',
        'a1000000-0000-4000-8000-000000000002'
      )
  ),
  true,
  'the restored version is promoted'
);
select is(
  (
    select current_version_id from public.design_screens
    where id = 'a0000000-0000-4000-8000-000000000001'
  ),
  (
    select id from public.design_screen_versions
    where screen_id = 'a0000000-0000-4000-8000-000000000001'
      and id not in (
        'a1000000-0000-4000-8000-000000000001',
        'a1000000-0000-4000-8000-000000000002'
      )
  ),
  'restore re-points current_version_id to the restored version'
);
select is(
  (
    select count(*)::integer from public.design_screen_events
    where kind = 'restored'
  ),
  1,
  'restore appends one restored event'
);

-- A viewer cannot restore a version.
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-4000-8000-000000000003',
  true
);
select throws_ok(
  $$ select public.restore_design_screen_version(
    'a0000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000001'
  ) $$,
  'P0001',
  'not_authorized',
  'a viewer cannot restore a version'
);

-- Restoring a version that belongs to a different screen fails lookup.
select set_config(
  'request.jwt.claim.sub',
  '96000000-0000-4000-8000-000000000002',
  true
);
select throws_ok(
  $$ select public.restore_design_screen_version(
    'a0000000-0000-4000-8000-000000000001',
    'a1000000-0000-4000-8000-000000000003'
  ) $$,
  'P0001',
  'design_screen_version_not_found',
  'restoring a version from another screen fails'
);

select * from finish();
rollback;
