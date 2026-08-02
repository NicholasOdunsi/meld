begin;

create extension if not exists pgtap with schema extensions;

select plan(20);

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
values
  (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'PRD Room',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Other Room',
    '10000000-0000-4000-8000-000000000003'
  );

insert into public.messages (
  id, room_id, client_id, author_id, body, created_at
)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Target-room context',
    '2026-08-02 09:00:00+00'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    'Other-room context',
    '2026-08-02 09:01:00+00'
  );

insert into public.attachments (
  id, room_id, message_id, uploaded_by, storage_path, original_name,
  mime_type, byte_size, extraction_status, extracted_text, discard_pending,
  created_at
)
values
  (
    '52000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001/included.txt',
    'included.txt', 'text/plain', 8, 'ready', 'included', false,
    '2026-08-02 09:02:00+00'
  ),
  (
    '52000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001',
    null,
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001/unlinked.txt',
    'unlinked.txt', 'text/plain', 8, 'ready', 'unlinked', false,
    '2026-08-02 09:03:00+00'
  ),
  (
    '52000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001/discarded.txt',
    'discarded.txt', 'text/plain', 9, 'ready', 'discarded', true,
    '2026-08-02 09:04:00+00'
  ),
  (
    '52000000-0000-4000-8000-000000000004',
    '40000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000003',
    '40000000-0000-4000-8000-000000000002/other.txt',
    'other.txt', 'text/plain', 5, 'ready', 'other', false,
    '2026-08-02 09:05:00+00'
  );

insert into public.evidence (
  id, room_id, message_id, title, note, created_by, created_at
)
values
  (
    '53000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'Target evidence', 'Target observation',
    '10000000-0000-4000-8000-000000000001',
    '2026-08-02 09:06:00+00'
  ),
  (
    '53000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000002',
    'Other evidence', 'Other observation',
    '10000000-0000-4000-8000-000000000003',
    '2026-08-02 09:07:00+00'
  );

insert into public.decisions (
  id, room_id, source_message_id, summary, created_by, created_at
)
values
  (
    '54000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'Target decision',
    '10000000-0000-4000-8000-000000000001',
    '2026-08-02 09:08:00+00'
  ),
  (
    '54000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000002',
    'Other decision',
    '10000000-0000-4000-8000-000000000003',
    '2026-08-02 09:09:00+00'
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
values
  (
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'installed', '1.0.0', 'authenticated', 'supported', now()
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'claude', 'installed', '1.0.0', 'authenticated', 'supported', now()
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

select is(
  public.create_prd_generate_task(
    '40000000-0000-4000-8000-000000000001'
  ) ->> 'provider',
  'codex',
  'the saved default provider is selected when no override is supplied'
);

select is(
  public.create_prd_generate_task(
    '40000000-0000-4000-8000-000000000001'
  ) ->> 'id',
  (
    select id::text
    from public.ai_tasks
    where room_id = '40000000-0000-4000-8000-000000000001'
      and kind = 'prd_generate'
      and status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
    order by created_at, id
    limit 1
  ),
  'a repeated request returns the active room generation task'
);

select is(
  (
    select count(*)::integer
    from public.ai_tasks
    where room_id = '40000000-0000-4000-8000-000000000001'
      and kind = 'prd_generate'
      and status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
  ),
  1,
  'repeated requests create only one active PRD generation per room'
);

reset role;
update public.ai_tasks
set status = 'cancelled', cancelled_at = now(), updated_at = now()
where room_id = '40000000-0000-4000-8000-000000000001'
  and kind = 'prd_generate'
  and status = 'queued';
set local role authenticated;

select is(
  public.create_prd_generate_task(
    '40000000-0000-4000-8000-000000000001',
    'claude'
  ) ->> 'provider',
  'claude',
  'an explicit ready provider overrides the saved default'
);

reset role;
update public.ai_tasks
set status = 'cancelled', cancelled_at = now(), updated_at = now()
where room_id = '40000000-0000-4000-8000-000000000001'
  and kind = 'prd_generate'
  and status = 'queued';
set local role authenticated;

reset role;
delete from public.provider_connections
where device_id = '30000000-0000-4000-8000-000000000001'
  and provider = 'claude';
set local role authenticated;

select throws_ok(
  $$
    select public.create_prd_generate_task(
      '40000000-0000-4000-8000-000000000001',
      'claude'
    )
  $$,
  'P0001', null,
  'an override with no provider connection is rejected'
);

reset role;
insert into public.provider_connections (
  user_id, device_id, provider, installation, version,
  authentication, compatibility, last_seen_at
)
values (
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'claude', 'not_installed', '1.0.0', 'authenticated', 'supported', now()
);
set local role authenticated;

select throws_ok(
  $$
    select public.create_prd_generate_task(
      '40000000-0000-4000-8000-000000000001',
      'claude'
    )
  $$,
  'P0001', null,
  'an override whose provider is not installed is rejected'
);

reset role;
update public.provider_connections
set installation = 'installed', authentication = 'signed_out'
where device_id = '30000000-0000-4000-8000-000000000001'
  and provider = 'claude';
set local role authenticated;

select throws_ok(
  $$
    select public.create_prd_generate_task(
      '40000000-0000-4000-8000-000000000001',
      'claude'
    )
  $$,
  'P0001', null,
  'an override whose provider is not authenticated is rejected'
);

reset role;
update public.provider_connections
set authentication = 'authenticated', compatibility = 'outdated'
where device_id = '30000000-0000-4000-8000-000000000001'
  and provider = 'claude';
set local role authenticated;

select throws_ok(
  $$
    select public.create_prd_generate_task(
      '40000000-0000-4000-8000-000000000001',
      'claude'
    )
  $$,
  'P0001', null,
  'an override whose provider is not supported is rejected'
);

reset role;
update public.provider_connections
set compatibility = 'supported'
where device_id = '30000000-0000-4000-8000-000000000001'
  and provider = 'claude';
update public.execution_devices
set status = 'revoked', revoked_at = null
where id = '30000000-0000-4000-8000-000000000001';
set local role authenticated;

select throws_ok(
  $$
    select public.create_prd_generate_task(
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001', null,
  'a non-active saved device is rejected'
);

reset role;
update public.execution_devices
set status = 'active', revoked_at = now()
where id = '30000000-0000-4000-8000-000000000001';
set local role authenticated;

select throws_ok(
  $$
    select public.create_prd_generate_task(
      '40000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001', null,
  'a saved device with a revocation timestamp is rejected'
);

reset role;
update public.execution_devices
set revoked_at = null
where id = '30000000-0000-4000-8000-000000000001';
set local role authenticated;

select is(
  (
    select context_manifest_json
    from public.ai_tasks
    where room_id = '40000000-0000-4000-8000-000000000001'
      and initiating_user_id = '10000000-0000-4000-8000-000000000001'
      and kind = 'prd_generate'
    order by created_at, id
    limit 1
  ),
  jsonb_build_object(
    'messageIds', jsonb_build_array(
      '50000000-0000-4000-8000-000000000001'::uuid
    ),
    'attachmentIds', jsonb_build_array(
      '52000000-0000-4000-8000-000000000001'::uuid
    ),
    'evidenceIds', jsonb_build_array(
      '53000000-0000-4000-8000-000000000001'::uuid
    ),
    'decisionIds', jsonb_build_array(
      '54000000-0000-4000-8000-000000000001'::uuid
    )
  ),
  'the frozen manifest includes only authorized linked room context'
);

do $$
begin
  perform public.create_prd_generate_task(
    '40000000-0000-4000-8000-000000000001'
  );
end;
$$;

select is(
  (
    select jsonb_build_object(
      'initiatingUserId', task.initiating_user_id,
      'organizationId', task.organization_id,
      'roomId', task.room_id,
      'deviceId', task.device_id,
      'kind', task.kind,
      'status', task.status,
      'instruction', task.instruction,
      'contextRevision', task.context_revision
    )
    from public.ai_tasks as task
    where task.room_id = '40000000-0000-4000-8000-000000000001'
      and task.kind = 'prd_generate'
      and task.status = 'queued'
    order by task.created_at desc, task.id desc
    limit 1
  ),
  jsonb_build_object(
    'initiatingUserId', '10000000-0000-4000-8000-000000000001'::uuid,
    'organizationId', '20000000-0000-4000-8000-000000000001'::uuid,
    'roomId', '40000000-0000-4000-8000-000000000001'::uuid,
    'deviceId', '30000000-0000-4000-8000-000000000001'::uuid,
    'kind', 'prd_generate',
    'status', 'queued',
    'instruction',
      'Draft a full PRD from this room''s conversation, evidence, and decisions.',
    'contextRevision', 0
  ),
  'the queued task freezes the required identity, kind, status, instruction and revision'
);

select is(
  (
    with response as (
      select public.create_prd_generate_task(
        '40000000-0000-4000-8000-000000000001'
      ) as body
    )
    select array_agg(response_key order by response_key)
    from response
    cross join lateral jsonb_object_keys(body) as keys(response_key)
  ),
  array[
    'createdAt', 'id', 'kind', 'provider', 'roomId', 'status', 'updatedAt'
  ]::text[],
  'the response exposes only the safe camelCase task projection'
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

reset role;

select function_privs_are(
  'public', 'create_prd_generate_task',
  array['uuid', 'public.ai_provider'],
  'authenticated', array['EXECUTE'],
  'authenticated may execute PRD generation'
);

select function_privs_are(
  'public', 'create_prd_generate_task',
  array['uuid', 'public.ai_provider'],
  'anon', array[]::name[],
  'anon may not execute PRD generation'
);

select function_privs_are(
  'public', 'create_prd_generate_task',
  array['uuid', 'public.ai_provider'],
  'service_role', array[]::name[],
  'service_role may not execute PRD generation'
);

select has_index(
  'public'::name,
  'ai_tasks'::name,
  'ai_tasks_one_active_prd_generate_per_room'::name
);

select * from finish();
rollback;
