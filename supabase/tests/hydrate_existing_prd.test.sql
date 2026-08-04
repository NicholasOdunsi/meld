begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '10000000-0000-4000-8000-000000000001', 'authenticated',
  'authenticated', 'hydrate-prd@example.com', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.organizations (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000001', 'Hydrate PRD',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.discovery_rooms (id, organization_id, name, owner_id)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 'PRD Room',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.execution_devices (id, user_id, name, platform, token_hash, status)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Owner Mac', 'macos', repeat('1', 64), 'active'
);

insert into public.prds (
  room_id, organization_id, version, status, document, owner_id, created_by
)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 3, 'draft',
  '{"title":"Vehicle Reassignment"}'::jsonb,
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);

-- Running prd_revise task + a live claimed attempt.
insert into public.ai_tasks (
  id, initiating_user_id, organization_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json
)
values
  (
    '70000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'prd_revise', 'running', 'Allow PAMS onboarding.',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
  ),
  (
    '70000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Is the PRD ready?',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
  );

insert into public.ai_task_attempts (
  id, task_id, device_id, attempt_no, lease_expires_at
)
values
  (
    '71000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001', 1, now() + interval '90 seconds'
  ),
  (
    '71000000-0000-4000-8000-000000000002',
    '70000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001', 1, now() + interval '90 seconds'
  );

-- A prd_revise task hydrates the full current PRD document.
select is(
  public.hydrate_authorized_room_context(
    '70000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001'
  ) #>> '{context,existingPrd,document,title}',
  'Vehicle Reassignment',
  'a prd_revise task hydrates the full current PRD document'
);

select is(
  (public.hydrate_authorized_room_context(
    '70000000-0000-4000-8000-000000000001',
    '71000000-0000-4000-8000-000000000001'
  ) #>> '{context,existingPrd,version}')::int,
  3,
  'a prd_revise task hydrates the current PRD version'
);

-- A room_reply task hydrates only a title summary, not the document.
select is(
  public.hydrate_authorized_room_context(
    '70000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002'
  ) #>> '{context,existingPrd,title}',
  'Vehicle Reassignment',
  'a room_reply task hydrates the PRD title summary'
);

select ok(
  (public.hydrate_authorized_room_context(
    '70000000-0000-4000-8000-000000000002',
    '71000000-0000-4000-8000-000000000002'
  ) #> '{context,existingPrd,document}') is null,
  'a room_reply task does not hydrate the full PRD document'
);

select * from finish();
rollback;
