begin;

create extension if not exists pgtap with schema extensions;

select plan(4);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  '10000000-0000-4000-8000-000000000001', 'authenticated',
  'authenticated', 'prd-revise-mat@example.com', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

insert into public.workspaces (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000001', 'Revise Materialize',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.rooms (id, workspace_id, name, owner_id)
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

-- Existing accepted v1: a revision must never mutate it.
insert into public.prds (
  room_id, workspace_id, version, status, document, owner_id, created_by,
  accepted_at, accepted_by
)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 1, 'accepted',
  '{"title":"Vehicle Reassignment"}'::jsonb,
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  now(), '10000000-0000-4000-8000-000000000001'
);

-- A running prd_revise task; completing it should materialize v2.
insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json
)
values (
  '70000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'codex', 'prd_revise', 'running',
  'Allow reassignment from PAMS-onboarded users.',
  '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
);

update public.ai_tasks
set status = 'completed',
    result_json = jsonb_build_object(
      'kind', 'prd_revise', 'partial', false,
      'payload', '{"title":"Vehicle Reassignment (revised)"}'::jsonb
    )
where id = '70000000-0000-4000-8000-000000000001';

select is(
  (select max(version) from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001'),
  2,
  'a completed prd_revise materializes the next version'
);

select is(
  (select status::text from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001' and version = 2),
  'draft',
  'the revised version is a draft'
);

select is(
  (select source_task_id from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001' and version = 2),
  '70000000-0000-4000-8000-000000000001'::uuid,
  'the revised version records its source task'
);

select is(
  (select status::text from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001' and version = 1),
  'accepted',
  'the accepted prior version is left untouched'
);

select * from finish();
rollback;
