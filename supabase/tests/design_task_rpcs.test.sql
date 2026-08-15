begin;

create extension if not exists pgtap with schema extensions;

select plan(29);

select has_table(
  'public'::name,
  'design_profile_distills'::name,
  'profile distill tracking exists'::text
);
select has_table(
  'public'::name,
  'design_screen_generations'::name,
  'screen generation tracking exists'::text
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_design_profile_distill_task(uuid, public.ai_provider, text, text, text)',
    'EXECUTE'
  ),
  'anonymous users cannot queue profile distillation'
);
select ok(
  not has_function_privilege(
    'anon',
    'public.create_design_screen_generate_task(uuid, public.ai_provider)',
    'EXECUTE'
  ),
  'anonymous users cannot queue screen generation'
);
select ok(
  not has_function_privilege(
    'authenticated',
    'public.materialize_design_screen_generate()',
    'EXECUTE'
  ),
  'browser users cannot invoke the screen materializer directly'
);
select has_function(
  'public'::name,
  'hydrate_authorized_room_context'::name,
  array['uuid'::name, 'uuid'::name],
  'the two-argument hydration wrapper remains installed'::text
);
-- The design hydration logic lives in the hydrate_authorized_room_context
-- chain. A later feature (user_flow_assist) wraps the two-arg entrypoint and
-- moves the design body into hydrate_authorized_room_context_pre_user_flow_assist,
-- so match the prefix rather than only the wrapper -- passes with or without
-- that wrapper installed.
select ok(
  exists (
    select 1
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname like 'hydrate_authorized_room_context%'
      and pg_get_functiondef(procedure.oid)
        like '%design_screen_generate%designProfile%designScreen%'
  ),
  'screen hydration adds the pinned design profile and screen context'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('90000000-0000-4000-8000-000000000001','authenticated','authenticated','task-owner@example.com','',now(),'{}','{}',now(),now()),
  ('90000000-0000-4000-8000-000000000002','authenticated','authenticated','task-editor@example.com','',now(),'{}','{}',now(),now()),
  ('90000000-0000-4000-8000-000000000003','authenticated','authenticated','task-viewer@example.com','',now(),'{}','{}',now(),now()),
  ('90000000-0000-4000-8000-000000000004','authenticated','authenticated','task-outsider@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  '91000000-0000-4000-8000-000000000001',
  'Task Workspace',
  '90000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'Task Project',
  '90000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values
  ('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','member'),
  ('91000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000003','member');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  '93000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  '92000000-0000-4000-8000-000000000001',
  'Task Room',
  '90000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values
  ('93000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000002','edit','90000000-0000-4000-8000-000000000001'),
  ('93000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000003','view','90000000-0000-4000-8000-000000000001');
insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  '94000000-0000-4000-8000-000000000001',
  '93000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000001',
  'Task Screen',
  '90000000-0000-4000-8000-000000000002'
);

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values
  ('95000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002','Editor Mac','macos',repeat('a',64),'active'),
  ('95000000-0000-4000-8000-000000000003','90000000-0000-4000-8000-000000000003','Viewer Mac','macos',repeat('b',64),'active');
insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values
  ('90000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000002','codex','installed','authenticated','supported'),
  ('90000000-0000-4000-8000-000000000003','95000000-0000-4000-8000-000000000003','codex','installed','authenticated','supported');
insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values
  ('90000000-0000-4000-8000-000000000002','95000000-0000-4000-8000-000000000002','codex'),
  ('90000000-0000-4000-8000-000000000003','95000000-0000-4000-8000-000000000003','codex');

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000003',
  true
);
select throws_ok(
  $$ select public.create_design_screen_generate_task(
    '94000000-0000-4000-8000-000000000001'
  ) $$,
  'P0001',
  'invalid_design_screen_generate_request',
  'a viewer cannot queue screen generation'
);

select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000002',
  true
);
select lives_ok(
  $$ select public.create_design_screen_generate_task(
    '94000000-0000-4000-8000-000000000001'
  ) $$,
  'an editor can queue screen generation'
);
select is(
  (select count(*)::integer from public.design_screen_generations),
  1,
  'screen generation creates one tracking row'
);
select is(
  (
    public.create_design_screen_generate_task(
      '94000000-0000-4000-8000-000000000001'
    ) ->> 'id'
  )::uuid,
  (select task_id from public.design_screen_generations),
  'screen generation is idempotent while active'
);
select is(
  (
    select updating from public.design_screens
    where id = '94000000-0000-4000-8000-000000000001'
  ),
  true,
  'queueing marks the screen as updating'
);
select is(
  (
    select count(*)::integer from public.design_screen_events
    where kind = 'generation_started'
  ),
  1,
  'queueing appends one generation-started event'
);

reset role;
update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {
        "markup": "<main>Checkout</main>",
        "styles": "main { display: block; }",
        "script": null,
        "actions": []
      }
    }'
where kind = 'design_screen_generate';

select is(
  (select count(*)::integer from public.design_screen_versions),
  1,
  'completed screen output materializes one version'
);
select is(
  (select promoted from public.design_screen_versions),
  true,
  'the first generated version is promoted'
);
select is(
  (
    select count(*)::integer from public.design_screen_events
    where kind in ('version_created', 'version_promoted')
  ),
  2,
  'materialization appends created and promoted events'
);
update public.ai_tasks set updated_at = now()
where kind = 'design_screen_generate';
select is(
  (select count(*)::integer from public.design_screen_versions),
  1,
  'screen materialization is replay-safe'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000002',
  true
);
select is(
  (
    select count(*)::integer
    from public.get_design_screen_generation(
      (select task_id from public.design_screen_generations)
    )
  ),
  1,
  'a participant can read the narrow screen result'
);
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000004',
  true
);
select is(
  (
    select count(*)::integer
    from public.get_design_screen_generation(
      (select task_id from public.design_screen_generations)
    )
  ),
  0,
  'an outsider cannot read the narrow screen result'
);

select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000002',
  true
);
select lives_ok(
  $$ select public.create_design_profile_distill_task(
    '93000000-0000-4000-8000-000000000001',
    null,
    '91000000-0000-4000-8000-000000000001/source.md',
    'Primary color is #112233. Body text is 16px.',
    'source.md'
  ) $$,
  'an editor can queue profile distillation'
);
select is(
  (select count(*)::integer from public.design_profile_distills),
  1,
  'profile distillation creates one tracking row'
);
select is(
  (select source_extracted_text from public.design_profile_distills limit 1),
  'Primary color is #112233. Body text is 16px.',
  'profile distillation stores the extracted source text'
);
select is(
  (select source_file_name from public.design_profile_distills limit 1),
  'source.md',
  'profile distillation stores the source file name'
);
select is(
  (
    public.create_design_profile_distill_task(
      '93000000-0000-4000-8000-000000000001',
      null,
      '91000000-0000-4000-8000-000000000001/source.md'
    ) ->> 'id'
  )::uuid,
  (select task_id from public.design_profile_distills),
  'profile distillation is idempotent while active'
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
        "tokenCss": ":root { --ds-color-primary: #112233; }"
      }
    }'
where kind = 'design_profile_distill';

select is(
  (select count(*)::integer from public.design_system_profile_versions),
  1,
  'completed profile output materializes one version'
);
select is(
  (
    select profile.active_version_id
    from public.design_system_profiles as profile
    where profile.workspace_id = '91000000-0000-4000-8000-000000000001'
  ),
  (select version_id from public.design_profile_distills),
  'profile materialization promotes the exact task result'
);
update public.ai_tasks set updated_at = now()
where kind = 'design_profile_distill';
select is(
  (select count(*)::integer from public.design_system_profile_versions),
  1,
  'profile materialization is replay-safe'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000002',
  true
);
select is(
  (
    select count(*)::integer
    from public.get_design_profile_distillation(
      (select task_id from public.design_profile_distills)
    )
    where is_active
  ),
  1,
  'a member can read the active narrow profile result'
);
select set_config(
  'request.jwt.claim.sub',
  '90000000-0000-4000-8000-000000000004',
  true
);
select is(
  (
    select count(*)::integer
    from public.get_design_profile_distillation(
      (select task_id from public.design_profile_distills)
    )
  ),
  0,
  'an outsider cannot read the narrow profile result'
);

select * from finish();
rollback;
