begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'prd-revise-owner@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000003', 'authenticated',
    'authenticated', 'prd-revise-outsider@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.workspaces (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000001', 'PRD Revision',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.projects (id, workspace_id, name, created_by)
values (
  '70000000-0000-4000-8000-000000000007',
  '20000000-0000-4000-8000-000000000001',
  'PRD Revision Project',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.memberships (workspace_id, user_id, role)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003', 'member'
);

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000007', 'PRD Room',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000007', 'Other Room',
    '10000000-0000-4000-8000-000000000001'
  );

-- The change request lives in the target room; a decoy lives in another room.
insert into public.messages (id, room_id, client_id, author_id, body, created_at)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Update the PRD to allow reassignment from PAMS-onboarded users.',
    '2026-08-04 09:00:00+00'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'A message in a different room.',
    '2026-08-04 09:01:00+00'
  );

-- The room already has a PRD (required for a revision).
insert into public.prds (
  room_id, workspace_id, version, status, document, owner_id, created_by
)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 1, 'draft',
  '{"title":"Vehicle Reassignment"}'::jsonb,
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.execution_devices (id, user_id, name, platform, token_hash, status)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Owner Mac', 'macos', repeat('1', 64), 'active'
);

insert into public.provider_connections (
  user_id, device_id, provider, installation, version,
  authentication, compatibility, last_seen_at
)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'codex', 'installed', '1.0.0', 'authenticated', 'supported', now()
);

insert into public.ai_user_preferences (user_id, default_device_id, default_provider)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001', 'codex'
);

-- The offering room-reply tasks: one whose source message is in the target room,
-- one whose source message is in a different room.
insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json, source_message_id
)
values
  (
    '60000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'completed', 'reply', '{}'::jsonb,
    '50000000-0000-4000-8000-000000000001'
  ),
  (
    '60000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'completed', 'reply', '{}'::jsonb,
    '50000000-0000-4000-8000-000000000002'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub', '10000000-0000-4000-8000-000000000001', true
);

select lives_ok(
  $$
    select public.create_prd_revise_task(
      '40000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001'
    )
  $$,
  'participant with a PRD and a ready device can start a revision'
);

select is(
  (
    select count(*)::integer from public.ai_tasks
    where room_id = '40000000-0000-4000-8000-000000000001'
      and kind = 'prd_revise'
  ),
  1,
  'creates a prd_revise task'
);

select is(
  (
    select instruction from public.ai_tasks
    where room_id = '40000000-0000-4000-8000-000000000001'
      and kind = 'prd_revise'
    order by created_at, id limit 1
  ),
  'Update the PRD to allow reassignment from PAMS-onboarded users.',
  'the task instruction is the change-request message body'
);

select is(
  (
    select count(*)::integer from public.ai_tasks
    where room_id = '40000000-0000-4000-8000-000000000001'
      and kind = 'prd_revise'
      and status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
  ),
  1,
  'repeated requests create only one active PRD revision per room'
);

select is(
  (
    select context_manifest_json -> 'messageIds' from public.ai_tasks
    where room_id = '40000000-0000-4000-8000-000000000001'
      and kind = 'prd_revise' order by created_at, id limit 1
  ),
  jsonb_build_array('50000000-0000-4000-8000-000000000001'::uuid),
  'the frozen manifest carries the room message ids'
);

select throws_ok(
  $$
    select public.create_prd_revise_task(
      '40000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001', null,
  'a source task from another room is rejected'
);

-- A room with no PRD cannot be revised.
select throws_ok(
  $$
    select public.create_prd_revise_task(
      '40000000-0000-4000-8000-000000000002',
      '60000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001', null,
  'a room with no existing PRD cannot be revised'
);

select set_config(
  'request.jwt.claim.sub', '10000000-0000-4000-8000-000000000003', true
);
select throws_ok(
  $$
    select public.create_prd_revise_task(
      '40000000-0000-4000-8000-000000000001',
      '60000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001', null,
  'a non-participant cannot start a revision'
);

reset role;

select has_index(
  'public'::name, 'ai_tasks'::name,
  'ai_tasks_one_active_prd_revise_per_room'::name
);

select * from finish();
rollback;
