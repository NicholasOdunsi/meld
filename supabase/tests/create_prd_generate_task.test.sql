begin;

create extension if not exists pgtap with schema extensions;

select plan(3);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'prd-task-owner@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000003', 'authenticated',
    'authenticated', 'prd-task-outsider@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.organizations (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000001',
  'PRD Generation',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.memberships (organization_id, user_id, role)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'member'
);

insert into public.discovery_rooms (id, organization_id, name, owner_id)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  'PRD Room',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values (
  '30000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'Owner Mac',
  'macos',
  repeat('1', 64),
  'active'
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

insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'codex'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$
    select public.create_prd_generate_task(
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  'participant with a ready device can start PRD generation'
);

select is(
  (
    select kind::text
    from public.ai_tasks
    where room_id = '40000000-0000-4000-8000-000000000001'
  ),
  'prd_generate',
  'creates a prd_generate task'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);
select throws_ok(
  $$
    select public.create_prd_generate_task(
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001', null,
  'non-participant cannot start PRD generation'
);

select * from finish();
rollback;
