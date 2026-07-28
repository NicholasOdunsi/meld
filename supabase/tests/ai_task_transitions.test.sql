begin;

create extension if not exists pgtap with schema extensions;

select plan(140);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'task-owner@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'other-user@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.organizations (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000001',
  'Durable Tasks',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.memberships (organization_id, user_id, role)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'member'
);

insert into public.discovery_rooms (id, organization_id, name, owner_id)
values
  (
    '40000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    'Owner room',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '40000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    'Other room',
    '10000000-0000-4000-8000-000000000002'
  );

insert into public.messages (id, room_id, client_id, author_id, body)
values
  (
    '50000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '51000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Summarize this room.'
  ),
  (
    '50000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    '51000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'This belongs to another room.'
  );

insert into public.attachments (
  id, room_id, uploaded_by, storage_path, original_name, mime_type,
  byte_size, extraction_status, extracted_text
)
values
  (
    '52000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001/owner.txt',
    'owner.txt',
    'text/plain',
    12,
    'ready',
    'Owner room attachment'
  ),
  (
    '52000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002/other.txt',
    'other.txt',
    'text/plain',
    12,
    'ready',
    'Other room attachment'
  );

insert into public.evidence (
  id, room_id, attachment_id, title, note, created_by
)
values
  (
    '53000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '52000000-0000-4000-8000-000000000001',
    'Owner evidence',
    'Observed in the owner room',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '53000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    '52000000-0000-4000-8000-000000000002',
    'Other evidence',
    'Observed in the other room',
    '10000000-0000-4000-8000-000000000002'
  );

insert into public.decisions (
  id, room_id, source_message_id, summary, created_by
)
values
  (
    '54000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '50000000-0000-4000-8000-000000000001',
    'Ship the owner-room fix',
    '10000000-0000-4000-8000-000000000001'
  ),
  (
    '54000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000002',
    '50000000-0000-4000-8000-000000000002',
    'Ship the other-room fix',
    '10000000-0000-4000-8000-000000000002'
  );

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values
  (
    '30000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'Owner Mac',
    'macos',
    repeat('1', 64),
    'active'
  ),
  (
    '30000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000002',
    'Other Mac',
    'macos',
    repeat('2', 64),
    'active'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    'Revoked Mac',
    'macos',
    repeat('3', 64),
    'revoked'
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    'No Provider Mac',
    'macos',
    repeat('4', 64),
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
    '10000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'codex', 'installed', '1.0.0', 'authenticated', 'supported', now()
  ),
  (
    '10000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    'codex', 'installed', '1.0.0', 'authenticated', 'supported', now()
  );

select throws_ok(
  $$
    insert into public.provider_connections (
      user_id, device_id, provider, installation, version,
      authentication, compatibility
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'claude', 'installed', '1.0.0', 'authenticated', 'supported'
    )
  $$,
  '23503', null,
  'a provider connection user cannot disagree with its device owner'
);

select throws_ok(
  $$
    insert into public.ai_tasks (
      initiating_user_id, organization_id, room_id, device_id,
      provider, kind, status, instruction, context_manifest_json
    )
    values (
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'codex', 'room_reply', 'queued', 'Wrong device owner',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  '23503', null,
  'a task initiating user cannot disagree with its device owner'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex',
      'room_reply',
      'Summarize the room',
      '{
        "messageIds":["50000000-0000-4000-8000-000000000001"],
        "attachmentIds":["52000000-0000-4000-8000-000000000001"],
        "evidenceIds":["53000000-0000-4000-8000-000000000001"],
        "decisionIds":["54000000-0000-4000-8000-000000000001"]
      }'::jsonb
    )
  $$,
  'an owner can create a task for an active connected device'
);

select ok(
  (
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex',
      'room_reply',
      'Return a task shape',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  ) ?& array[
    'id', 'initiatingUserId', 'organizationId', 'roomId', 'deviceId',
    'provider', 'kind', 'status', 'instruction', 'contextManifest',
    'contextRevision', 'result', 'errorCode', 'errorMessage', 'cancelledAt',
    'createdAt', 'updatedAt'
  ],
  'creation returns camel-case-compatible task columns'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'codex', 'room_reply', 'Wrong owner',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  'P0001', null,
  'another user''s device is rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000003',
      'codex', 'room_reply', 'Revoked',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  'P0001', null,
  'a revoked device is rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000004',
      'codex', 'room_reply', 'Missing provider',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  'P0001', null,
  'a missing provider connection is rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Not a participant',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  'P0001', null,
  'a non-participant room is rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', repeat('x', 20001),
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  'P0001', null,
  'an overlong instruction is rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Too many messages',
      jsonb_build_object(
        'messageIds', (
          select jsonb_agg(
            '55000000-0000-4000-8000-' || lpad(to_hex(value), 12, '0')
          ) from generate_series(1, 501) as value
        ),
        'attachmentIds', '[]'::jsonb,
        'evidenceIds', '[]'::jsonb,
        'decisionIds', '[]'::jsonb
      )
    )
  $$,
  'P0001', null,
  '501 manifest messages are rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Too many attachments',
      jsonb_build_object(
        'messageIds', '[]'::jsonb,
        'attachmentIds', (
          select jsonb_agg(
            '56000000-0000-4000-8000-' || lpad(to_hex(value), 12, '0')
          ) from generate_series(1, 51) as value
        ),
        'evidenceIds', '[]'::jsonb,
        'decisionIds', '[]'::jsonb
      )
    )
  $$,
  'P0001', null,
  '51 manifest attachments are rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Too much evidence',
      jsonb_build_object(
        'messageIds', '[]'::jsonb,
        'attachmentIds', '[]'::jsonb,
        'evidenceIds', (
          select jsonb_agg(
            '57000000-0000-4000-8000-' || lpad(to_hex(value), 12, '0')
          ) from generate_series(1, 101) as value
        ),
        'decisionIds', '[]'::jsonb
      )
    )
  $$,
  'P0001', null,
  '101 manifest evidence records are rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Too many decisions',
      jsonb_build_object(
        'messageIds', '[]'::jsonb,
        'attachmentIds', '[]'::jsonb,
        'evidenceIds', '[]'::jsonb,
        'decisionIds', (
          select jsonb_agg(
            '58000000-0000-4000-8000-' || lpad(to_hex(value), 12, '0')
          ) from generate_series(1, 101) as value
        )
      )
    )
  $$,
  'P0001', null,
  '101 manifest decisions are rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Oversized manifest',
      jsonb_build_object(
        'messageIds', (
          select jsonb_agg(repeat(value::text, 700))
          from generate_series(1, 500) as value
        ),
        'attachmentIds', '[]'::jsonb,
        'evidenceIds', '[]'::jsonb,
        'decisionIds', '[]'::jsonb
      )
    )
  $$,
  'P0001', null,
  'a manifest above 256 KiB is rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Duplicate message',
      '{
        "messageIds":[
          "50000000-0000-4000-8000-000000000001",
          "50000000-0000-4000-8000-000000000001"
        ],
        "attachmentIds":[],"evidenceIds":[],"decisionIds":[]
      }'::jsonb
    )
  $$,
  'P0001', null,
  'duplicate message IDs are rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Duplicate attachment',
      '{
        "messageIds":[],
        "attachmentIds":[
          "52000000-0000-4000-8000-000000000001",
          "52000000-0000-4000-8000-000000000001"
        ],
        "evidenceIds":[],"decisionIds":[]
      }'::jsonb
    )
  $$,
  'P0001', null,
  'duplicate attachment IDs are rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Duplicate evidence',
      '{
        "messageIds":[],"attachmentIds":[],
        "evidenceIds":[
          "53000000-0000-4000-8000-000000000001",
          "53000000-0000-4000-8000-000000000001"
        ],
        "decisionIds":[]
      }'::jsonb
    )
  $$,
  'P0001', null,
  'duplicate evidence IDs are rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Duplicate decision',
      '{
        "messageIds":[],"attachmentIds":[],"evidenceIds":[],
        "decisionIds":[
          "54000000-0000-4000-8000-000000000001",
          "54000000-0000-4000-8000-000000000001"
        ]
      }'::jsonb
    )
  $$,
  'P0001', null,
  'duplicate decision IDs are rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Cross-room message',
      '{
        "messageIds":["50000000-0000-4000-8000-000000000002"],
        "attachmentIds":[],"evidenceIds":[],"decisionIds":[]
      }'::jsonb
    )
  $$,
  'P0001', null,
  'a cross-room message is rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Cross-room attachment',
      '{
        "messageIds":[],
        "attachmentIds":["52000000-0000-4000-8000-000000000002"],
        "evidenceIds":[],"decisionIds":[]
      }'::jsonb
    )
  $$,
  'P0001', null,
  'a cross-room attachment is rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Cross-room evidence',
      '{
        "messageIds":[],"attachmentIds":[],
        "evidenceIds":["53000000-0000-4000-8000-000000000002"],
        "decisionIds":[]
      }'::jsonb
    )
  $$,
  'P0001', null,
  'cross-room evidence is rejected'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'Cross-room decision',
      '{
        "messageIds":[],"attachmentIds":[],"evidenceIds":[],
        "decisionIds":["54000000-0000-4000-8000-000000000002"]
      }'::jsonb
    )
  $$,
  'P0001', null,
  'a cross-room decision is rejected'
);

select throws_ok(
  $$ select public.ai_task_lease_duration() $$,
  '42501', null,
  'authenticated cannot execute the internal lease function'
);

select throws_ok(
  $$
    select public.transition_ai_task(
      '70000000-0000-4000-8000-000000000099',
      'ready_to_run',
      'queued'
    )
  $$,
  '42501', null,
  'authenticated cannot execute the internal transition function'
);

reset role;

select throws_ok(
  $$
    insert into public.ai_tasks (
      id, initiating_user_id, organization_id, room_id, device_id,
      provider, kind, status, instruction, context_manifest_json
    )
    values (
      '70000000-0000-4000-8000-000000000099',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000099',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'queued', 'Mismatch',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  '23503', null,
  'a task organization cannot disagree with its room'
);

insert into public.ai_tasks (
  id, initiating_user_id, organization_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json
)
select
  ('70000000-0000-4000-8000-' || lpad(to_hex(value), 12, '0'))::uuid,
  case when value = 40
    then '10000000-0000-4000-8000-000000000002'::uuid
    else '10000000-0000-4000-8000-000000000001'::uuid
  end,
  '20000000-0000-4000-8000-000000000001',
  case when value = 40
    then '40000000-0000-4000-8000-000000000002'::uuid
    else '40000000-0000-4000-8000-000000000001'::uuid
  end,
  case when value = 40
    then '30000000-0000-4000-8000-000000000002'::uuid
    else '30000000-0000-4000-8000-000000000001'::uuid
  end,
  'codex',
  'room_reply',
  (
    case value
      when 1 then 'queued'
      when 2 then 'queued'
      when 3 then 'waiting_for_device'
      when 4 then 'ready_to_run'
      when 5 then 'ready_to_run'
      when 6 then 'running'
      when 7 then 'running'
      when 8 then 'running'
      when 9 then 'running'
      when 10 then 'running'
      when 11 then 'needs_reauthentication'
      when 12 then 'usage_limit_reached'
      when 13 then 'needs_review'
      when 14 then 'needs_review'
      when 15 then 'completed'
      when 16 then 'cancelled'
      when 17 then 'failed'
      when 18 then 'queued'
      when 19 then 'waiting_for_device'
      when 20 then 'ready_to_run'
      when 21 then 'running'
      when 22 then 'needs_reauthentication'
      when 23 then 'usage_limit_reached'
      when 24 then 'needs_review'
      when 25 then 'queued'
      when 26 then 'waiting_for_device'
      when 27 then 'ready_to_run'
      when 28 then 'running'
      when 29 then 'needs_reauthentication'
      when 30 then 'usage_limit_reached'
      when 31 then 'needs_review'
      when 32 then 'queued'
      when 33 then 'running'
      when 34 then 'needs_reauthentication'
      when 35 then 'usage_limit_reached'
      when 36 then 'needs_review'
      when 37 then 'needs_review'
      when 38 then 'needs_review'
      when 39 then 'queued'
      when 40 then 'queued'
      when 41 then 'completed'
    end
  )::public.ai_task_status,
  'Transition fixture ' || value,
  '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
from generate_series(1, 41) as value;

insert into public.ai_task_attempts (
  id, task_id, device_id, attempt_no, started_at, lease_expires_at
)
select
  ('71000000-0000-4000-8000-' || lpad(to_hex(value), 12, '0'))::uuid,
  ('70000000-0000-4000-8000-' || lpad(to_hex(value), 12, '0'))::uuid,
  '30000000-0000-4000-8000-000000000001',
  1,
  now(),
  now() + interval '90 seconds'
from unnest(array[6, 7, 8, 9, 10, 21, 28, 33]) as value;

select throws_ok(
  $$
    insert into public.ai_task_attempts (
      id, task_id, device_id, attempt_no, lease_expires_at
    )
    values (
      '71000000-0000-4000-8000-000000000099',
      '70000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      1,
      now() + interval '90 seconds'
    )
  $$,
  '23503', null,
  'an attempt device cannot disagree with its task device'
);

select throws_ok(
  $$
    insert into public.ai_task_events (
      task_id, attempt_id, sequence, type, payload_json
    )
    values (
      '70000000-0000-4000-8000-000000000007',
      '71000000-0000-4000-8000-000000000006',
      1,
      'progress',
      '{"label":"wrong task"}'::jsonb
    )
  $$,
  '23503', null,
  'an event task cannot disagree with its attempt task'
);

insert into public.ai_tasks (
  id, initiating_user_id, organization_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json
)
values
  (
    '80000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'ready_to_run', 'Claim exactly once',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'ready_to_run', 'Reject the wrong device',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'One current attempt',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-000000000004',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Ordered event fixture',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-000000000006',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Expired without events',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-000000000007',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Expired after an event',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-000000000008',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Complete settlement',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-000000000009',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Review settlement',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-00000000000a',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Authentication settlement',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-00000000000b',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Usage settlement',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-00000000000c',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Renewable lease',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-00000000000d',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'running', 'Expired renewal fence',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '80000000-0000-4000-8000-00000000000e',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'ready_to_run', 'Increment attempt number',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  );

insert into public.ai_task_attempts (
  id, task_id, device_id, attempt_no, lease_expires_at,
  settled_at, outcome, settle_operation, settle_fingerprint
)
values
  (
    '81000000-0000-4000-8000-000000000003',
    '80000000-0000-4000-8000-000000000003',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '90 seconds', null, null, null, null
  ),
  (
    '81000000-0000-4000-8000-000000000004',
    '80000000-0000-4000-8000-000000000004',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '30 seconds', null, null, null, null
  ),
  (
    '81000000-0000-4000-8000-000000000006',
    '80000000-0000-4000-8000-000000000006',
    '30000000-0000-4000-8000-000000000001',
    1, now() - interval '1 microsecond', null, null, null, null
  ),
  (
    '81000000-0000-4000-8000-000000000007',
    '80000000-0000-4000-8000-000000000007',
    '30000000-0000-4000-8000-000000000001',
    1, now() - interval '1 microsecond', null, null, null, null
  ),
  (
    '81000000-0000-4000-8000-000000000008',
    '80000000-0000-4000-8000-000000000008',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '90 seconds', null, null, null, null
  ),
  (
    '81000000-0000-4000-8000-000000000009',
    '80000000-0000-4000-8000-000000000009',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '90 seconds', null, null, null, null
  ),
  (
    '81000000-0000-4000-8000-00000000000a',
    '80000000-0000-4000-8000-00000000000a',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '90 seconds', null, null, null, null
  ),
  (
    '81000000-0000-4000-8000-00000000000b',
    '80000000-0000-4000-8000-00000000000b',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '90 seconds', null, null, null, null
  ),
  (
    '81000000-0000-4000-8000-00000000000c',
    '80000000-0000-4000-8000-00000000000c',
    '30000000-0000-4000-8000-000000000001',
    1, now() + interval '90 seconds', null, null, null, null
  ),
  (
    '81000000-0000-4000-8000-00000000000d',
    '80000000-0000-4000-8000-00000000000d',
    '30000000-0000-4000-8000-000000000001',
    1, now() - interval '1 microsecond', null, null, null, null
  ),
  (
    '81000000-0000-4000-8000-00000000000e',
    '80000000-0000-4000-8000-00000000000e',
    '30000000-0000-4000-8000-000000000001',
    1, now() - interval '1 second', now() - interval '500 milliseconds',
    'waiting_for_device', 'fail', decode(repeat('00', 32), 'hex')
  );

insert into public.ai_task_events (
  task_id, attempt_id, sequence, type, payload_json
)
values (
  '80000000-0000-4000-8000-000000000007',
  '81000000-0000-4000-8000-000000000007',
  1, 'progress', '{"label":"Work started"}'
);

select throws_ok(
  $$
    insert into public.ai_task_attempts (
      id, task_id, device_id, attempt_no, lease_expires_at
    )
    values (
      '81000000-0000-4000-8000-0000000000ff',
      '80000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000001',
      2, now() + interval '90 seconds'
    )
  $$,
  '23505', null,
  'the partial unique index permits only one current attempt'
);

select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000001',
    'waiting_for_device',
    'queued'
  ) $$,
  'queued task can wait for its device'
);

select throws_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000001',
    'completed',
    'waiting_for_device'
  ) $$,
  'P0001',
  'invalid_ai_task_transition',
  'task cannot skip execution'
);

select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000002', 'ready_to_run', 'queued'
  ) $$,
  'queued task can become ready'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000003', 'ready_to_run', 'waiting_for_device'
  ) $$,
  'waiting task can become ready'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000004', 'running', 'ready_to_run'
  ) $$,
  'ready task can run'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000005', 'waiting_for_device', 'ready_to_run'
  ) $$,
  'ready task can return to waiting'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000006', 'completed', 'running'
  ) $$,
  'running task can complete'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000007', 'needs_review', 'running'
  ) $$,
  'running task can need review'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000008', 'needs_reauthentication', 'running'
  ) $$,
  'running task can need reauthentication'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000009', 'usage_limit_reached', 'running'
  ) $$,
  'running task can reach a usage limit'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-00000000000a', 'waiting_for_device', 'running'
  ) $$,
  'running task can return to waiting'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-00000000000b', 'ready_to_run', 'needs_reauthentication'
  ) $$,
  'reauthenticated task can become ready'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-00000000000c', 'ready_to_run', 'usage_limit_reached'
  ) $$,
  'usage-limited task can become ready'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-00000000000d', 'completed', 'needs_review'
  ) $$,
  'reviewed task can complete'
);
select lives_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-00000000000e', 'ready_to_run', 'needs_review'
  ) $$,
  'reviewed task can retry'
);

select throws_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-00000000000f', 'ready_to_run', 'completed'
  ) $$,
  'P0001', 'invalid_ai_task_transition',
  'completed tasks reject transitions'
);
select throws_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000010', 'ready_to_run', 'cancelled'
  ) $$,
  'P0001', 'invalid_ai_task_transition',
  'cancelled tasks reject transitions'
);
select throws_ok(
  $$ select public.transition_ai_task(
    '70000000-0000-4000-8000-000000000011', 'ready_to_run', 'failed'
  ) $$,
  'P0001', 'invalid_ai_task_transition',
  'failed tasks reject transitions'
);

select lives_ok(
  $$
    do $test$
    declare
      task_number integer;
    begin
      foreach task_number in array array[18, 19, 20, 21, 22, 23, 24]
      loop
        perform public.transition_ai_task(
          ('70000000-0000-4000-8000-' || lpad(to_hex(task_number), 12, '0'))::uuid,
          'cancelled',
          (
            select status from public.ai_tasks
            where id = (
              '70000000-0000-4000-8000-' ||
              lpad(to_hex(task_number), 12, '0')
            )::uuid
          )
        );
      end loop;
    end
    $test$
  $$,
  'every non-terminal state can transition to cancelled'
);

select lives_ok(
  $$
    do $test$
    declare
      task_number integer;
    begin
      foreach task_number in array array[25, 26, 27, 28, 29, 30, 31]
      loop
        perform public.transition_ai_task(
          ('70000000-0000-4000-8000-' || lpad(to_hex(task_number), 12, '0'))::uuid,
          'failed',
          (
            select status from public.ai_tasks
            where id = (
              '70000000-0000-4000-8000-' ||
              lpad(to_hex(task_number), 12, '0')
            )::uuid
          )
        );
      end loop;
    end
    $test$
  $$,
  'every non-terminal state can transition to failed'
);

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$ select public.cancel_ai_task(
    '70000000-0000-4000-8000-000000000020'
  ) $$,
  'the initiating user can cancel a queued task'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $$ select public.cancel_ai_task(
    '70000000-0000-4000-8000-000000000027'
  ) $$,
  'P0001', null,
  'another user cannot cancel a task'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select lives_ok(
  $$ select public.cancel_ai_task(
    '70000000-0000-4000-8000-000000000021'
  ) $$,
  'the initiating user can cancel a running task'
);

select ok(
  (
    select status = 'cancelled' and cancelled_at is not null
    from public.ai_tasks
    where id = '70000000-0000-4000-8000-000000000021'
  ),
  'cancellation stamps the task cancelled'
);

select ok(
  (
    select
      settled_at is not null
      and outcome = 'cancelled'
      and settle_operation = 'cancelled'
      and cancel_requested_at is not null
    from public.ai_task_attempts
    where task_id = '70000000-0000-4000-8000-000000000021'
  ),
  'running cancellation settles the current attempt and requests delivery'
);

select is(
  (
    select octet_length(settle_fingerprint)
    from public.ai_task_attempts
    where task_id = '70000000-0000-4000-8000-000000000021'
  ),
  32,
  'running cancellation stores a SHA-256 settlement fingerprint'
);

select lives_ok(
  $$ select public.resolve_ai_task(
    '70000000-0000-4000-8000-000000000022', 'retry'
  ) $$,
  'retry works from needs_reauthentication'
);
select lives_ok(
  $$ select public.resolve_ai_task(
    '70000000-0000-4000-8000-000000000023', 'retry'
  ) $$,
  'retry works from usage_limit_reached'
);
select lives_ok(
  $$ select public.resolve_ai_task(
    '70000000-0000-4000-8000-000000000024', 'retry'
  ) $$,
  'retry works from needs_review'
);
select lives_ok(
  $$ select public.resolve_ai_task(
    '70000000-0000-4000-8000-000000000025', 'accept'
  ) $$,
  'accept works from needs_review'
);
select lives_ok(
  $$ select public.resolve_ai_task(
    '70000000-0000-4000-8000-000000000026', 'discard'
  ) $$,
  'discard works from needs_review'
);

select throws_ok(
  $$ select public.resolve_ai_task(
    '70000000-0000-4000-8000-000000000027', 'retry'
  ) $$,
  'P0001', 'invalid_ai_task_resolution',
  'retry is rejected from queued'
);
select throws_ok(
  $$ select public.resolve_ai_task(
    '70000000-0000-4000-8000-000000000022', 'accept'
  ) $$,
  'P0001', 'invalid_ai_task_resolution',
  'accept is rejected outside needs_review'
);
select throws_ok(
  $$ select public.resolve_ai_task(
    '70000000-0000-4000-8000-000000000023', 'discard'
  ) $$,
  'P0001', 'invalid_ai_task_resolution',
  'discard is rejected outside needs_review'
);
select throws_ok(
  $$ select public.resolve_ai_task(
    '70000000-0000-4000-8000-000000000029', 'retry'
  ) $$,
  'P0001', 'invalid_ai_task_resolution',
  'terminal tasks reject resolution'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $$ select public.resolve_ai_task(
    '70000000-0000-4000-8000-000000000027', 'retry'
  ) $$,
  'P0001', null,
  'another user cannot resolve a task'
);

select is(
  (select count(*)::integer from public.execution_devices),
  1,
  'RLS exposes only the caller''s devices'
);
select is(
  (select count(*)::integer from public.provider_connections),
  1,
  'RLS exposes only the caller''s provider connections'
);
select ok(
  exists (
    select 1 from public.ai_tasks
    where id = '70000000-0000-4000-8000-000000000028'
  ),
  'a room participant can read their room task'
);
select is(
  (
    select count(*)::integer from public.ai_tasks
    where room_id = '40000000-0000-4000-8000-000000000001'
  ),
  0,
  'a non-participant cannot read another room''s tasks'
);

select throws_ok(
  $$
    insert into public.execution_devices (
      user_id, name, platform, token_hash, status
    )
    values (
      auth.uid(), 'Forbidden', 'macos', repeat('9', 64), 'active'
    )
  $$,
  '42501', null,
  'authenticated cannot write gateway-owned tables directly'
);

reset role;
set local role service_role;

select throws_ok(
  $$
    update public.ai_tasks
    set status = 'completed'
    where id = '70000000-0000-4000-8000-000000000028'
  $$,
  '42501', null,
  'service_role cannot write task tables directly'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002',
      'codex', 'room_reply', 'Forbidden service call',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  '42501', null,
  'service_role cannot execute authenticated-only task RPCs'
);

select ok(
  has_table_privilege(
    'authenticated', 'public.execution_devices', 'SELECT'
  )
  and not exists (
    select 1
    from unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'
    ]) as privilege
    where has_table_privilege(
      'authenticated', 'public.execution_devices', privilege
    )
  ),
  'authenticated has only SELECT on execution_devices'
);
select ok(
  has_table_privilege(
    'authenticated', 'public.provider_connections', 'SELECT'
  )
  and not exists (
    select 1
    from unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'
    ]) as privilege
    where has_table_privilege(
      'authenticated', 'public.provider_connections', privilege
    )
  ),
  'authenticated has only SELECT on provider_connections'
);
select ok(
  has_table_privilege('authenticated', 'public.ai_tasks', 'SELECT')
  and not exists (
    select 1
    from unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'
    ]) as privilege
    where has_table_privilege(
      'authenticated', 'public.ai_tasks', privilege
    )
  ),
  'authenticated has only SELECT on ai_tasks'
);
select ok(
  has_table_privilege('authenticated', 'public.ai_task_attempts', 'SELECT')
  and not exists (
    select 1
    from unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'
    ]) as privilege
    where has_table_privilege(
      'authenticated', 'public.ai_task_attempts', privilege
    )
  ),
  'authenticated has only SELECT on ai_task_attempts'
);
select ok(
  has_table_privilege('authenticated', 'public.ai_task_events', 'SELECT')
  and not exists (
    select 1
    from unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'
    ]) as privilege
    where has_table_privilege(
      'authenticated', 'public.ai_task_events', privilege
    )
  ),
  'authenticated has only SELECT on ai_task_events'
);

select ok(
  has_table_privilege(
    'service_role', 'public.execution_devices', 'SELECT'
  )
  and not exists (
    select 1
    from unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'
    ]) as privilege
    where has_table_privilege(
      'service_role', 'public.execution_devices', privilege
    )
  ),
  'service_role has only SELECT on execution_devices'
);
select ok(
  has_table_privilege(
    'service_role', 'public.provider_connections', 'SELECT'
  )
  and not exists (
    select 1
    from unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'
    ]) as privilege
    where has_table_privilege(
      'service_role', 'public.provider_connections', privilege
    )
  ),
  'service_role has only SELECT on provider_connections'
);
select ok(
  has_table_privilege('service_role', 'public.ai_tasks', 'SELECT')
  and not exists (
    select 1
    from unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'
    ]) as privilege
    where has_table_privilege(
      'service_role', 'public.ai_tasks', privilege
    )
  ),
  'service_role has only SELECT on ai_tasks'
);
select ok(
  has_table_privilege('service_role', 'public.ai_task_attempts', 'SELECT')
  and not exists (
    select 1
    from unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'
    ]) as privilege
    where has_table_privilege(
      'service_role', 'public.ai_task_attempts', privilege
    )
  ),
  'service_role has only SELECT on ai_task_attempts'
);
select ok(
  has_table_privilege('service_role', 'public.ai_task_events', 'SELECT')
  and not exists (
    select 1
    from unnest(array[
      'INSERT', 'UPDATE', 'DELETE', 'TRUNCATE', 'TRIGGER', 'REFERENCES'
    ]) as privilege
    where has_table_privilege(
      'service_role', 'public.ai_task_events', privilege
    )
  ),
  'service_role has only SELECT on ai_task_events'
);

create temporary table task_3_claim_results (payload jsonb);
create temporary table task_3_event_results (sequence bigint);
create temporary table task_3_renew_results (
  task_id uuid,
  attempt_id uuid
);
create temporary table task_3_settlement_results (
  label text,
  status public.ai_task_status
);
create temporary table task_3_reaper_results (
  task_id uuid,
  attempt_id uuid,
  outcome public.ai_task_status
);
create temporary table task_3_cancel_results (
  acknowledged_at timestamptz
);

select lives_ok(
  $$
    insert into task_3_claim_results
    select public.claim_ai_task(
      '80000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  'a ready task can be claimed by its assigned device'
);

select ok(
  (
    select payload ?& array[
      'taskId', 'attemptId', 'provider', 'kind', 'instruction'
    ]
      and (select count(*) from jsonb_object_keys(payload)) = 5
      and not payload ? 'contextManifest'
    from task_3_claim_results
    limit 1
  ),
  'claim returns identifiers and instruction without context'
);

select ok(
  (
    select task.status = 'running'
      and attempt.attempt_no = 1
      and attempt.lease_expires_at > now()
    from public.ai_tasks as task
    join public.ai_task_attempts as attempt on attempt.task_id = task.id
    where task.id = '80000000-0000-4000-8000-000000000001'
  ),
  'claim transitions to running with attempt one and a future lease'
);

select throws_ok(
  $$
    select public.claim_ai_task(
      '80000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001', 'ai_task_claim_rejected',
  'only one of two claims obtains the payload candidate'
);

select throws_ok(
  $$
    select public.claim_ai_task(
      '80000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001', 'ai_task_claim_rejected',
  'the wrong device cannot claim a task'
);

select lives_ok(
  $$
    insert into task_3_claim_results
    select public.claim_ai_task(
      '80000000-0000-4000-8000-00000000000e',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  'a task with a settled prior attempt can be claimed again'
);

select is(
  (
    select attempt_no
    from public.ai_task_attempts
    where task_id = '80000000-0000-4000-8000-00000000000e'
      and settled_at is null
  ),
  2,
  'claim increments the prior maximum attempt number'
);

select throws_ok(
  $$
    select public.append_ai_task_event(
      '80000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000004',
      7, 'progress', '{"label":"Skipped"}'
    )
  $$,
  'P0001', 'out_of_order_ai_task_event',
  'a new event cannot skip sequence one'
);

select lives_ok(
  $$
    insert into task_3_event_results
    select public.append_ai_task_event(
      '80000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000004',
      1, 'progress', '{"label":"Started"}'
    )
  $$,
  'the first event appends at sequence one'
);

select is(
  (
    select sequence from task_3_event_results order by ctid limit 1
  ),
  1::bigint,
  'event append acknowledges sequence one'
);

select ok(
  (
    select lease_expires_at = now() + interval '90 seconds'
    from public.ai_task_attempts
    where id = '81000000-0000-4000-8000-000000000004'
  ),
  'a newly appended event renews its attempt lease'
);

select lives_ok(
  $$
    insert into task_3_event_results
    select public.append_ai_task_event(
      '80000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000004',
      1, 'progress', '{"label":"Started"}'
    )
  $$,
  'an exact event replay is acknowledged'
);

select is(
  (
    select count(*)::integer
    from public.ai_task_events
    where attempt_id = '81000000-0000-4000-8000-000000000004'
  ),
  1,
  'an exact event replay does not insert a duplicate'
);

select throws_ok(
  $$
    select public.append_ai_task_event(
      '80000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000004',
      1, 'tool', '{"label":"Started"}'
    )
  $$,
  'P0001', 'conflicting_ai_task_event',
  'an event replay with a different type conflicts'
);

select throws_ok(
  $$
    select public.append_ai_task_event(
      '80000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000004',
      1, 'progress', '{"label":"Different"}'
    )
  $$,
  'P0001', 'conflicting_ai_task_event',
  'an event replay with a different payload conflicts'
);

select throws_ok(
  $$
    select public.append_ai_task_event(
      '80000000-0000-4000-8000-000000000004',
      '30000000-0000-4000-8000-000000000002',
      '81000000-0000-4000-8000-000000000004',
      2, 'progress', '{"label":"Wrong device"}'
    )
  $$,
  'P0001', 'stale_ai_task_attempt',
  'another device cannot append an event'
);

select throws_ok(
  $$
    select public.append_ai_task_event(
      '80000000-0000-4000-8000-000000000006',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000006',
      1, 'progress', '{"label":"Too late"}'
    )
  $$,
  'P0001', 'stale_ai_task_attempt',
  'an expired attempt cannot append an event'
);

select throws_ok(
  $$
    select public.append_ai_task_event(
      '70000000-0000-4000-8000-000000000021',
      '30000000-0000-4000-8000-000000000001',
      '71000000-0000-4000-8000-000000000021',
      1, 'progress', '{"label":"Cancelled"}'
    )
  $$,
  'P0001', 'stale_ai_task_attempt',
  'a cancelled task cannot append an event'
);

select lives_ok(
  $$
    insert into task_3_renew_results
    select * from public.renew_ai_task_leases(
      '30000000-0000-4000-8000-000000000001',
      '[
        {
          "taskId":"80000000-0000-4000-8000-00000000000c",
          "attemptId":"81000000-0000-4000-8000-00000000000c"
        },
        {
          "taskId":"80000000-0000-4000-8000-00000000000d",
          "attemptId":"81000000-0000-4000-8000-00000000000d"
        },
        {
          "taskId":"80000000-0000-4000-8000-0000000000ff",
          "attemptId":"81000000-0000-4000-8000-0000000000ff"
        }
      ]'::jsonb
    )
  $$,
  'lease renewal ignores stale and absent pairs'
);

select is(
  (select count(*)::integer from task_3_renew_results),
  1,
  'lease renewal returns only the matching unexpired attempt'
);

select ok(
  exists (
    select 1 from task_3_renew_results
    where task_id = '80000000-0000-4000-8000-00000000000c'
      and attempt_id = '81000000-0000-4000-8000-00000000000c'
  ) and not exists (
    select 1 from task_3_renew_results
    where attempt_id = '81000000-0000-4000-8000-00000000000d'
  ),
  'one-microsecond-expired leases cannot be renewed before reaping'
);

select throws_ok(
  $$
    select * from public.renew_ai_task_leases(
      '30000000-0000-4000-8000-000000000001',
      (
        select jsonb_agg(jsonb_build_object(
          'taskId', gen_random_uuid(),
          'attemptId', gen_random_uuid()
        ))
        from generate_series(1, 33)
      )
    )
  $$,
  'P0001', 'invalid_ai_task_lease_batch',
  'lease renewal rejects more than 32 active attempts'
);

select lives_ok(
  $$
    insert into task_3_settlement_results
    select 'completed', public.settle_ai_task(
      '80000000-0000-4000-8000-000000000008',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000008',
      'complete', null, null, '{"text":"Done"}', false
    )
  $$,
  'a valid completion settles the attempt'
);

select lives_ok(
  $$
    insert into task_3_settlement_results
    select 'needs_review', public.settle_ai_task(
      '80000000-0000-4000-8000-000000000009',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000009',
      'fail', 'malformed_output', 'Malformed output',
      '{"draft":"Partial"}', true
    )
  $$,
  'malformed output settles to needs review'
);

select lives_ok(
  $$
    insert into task_3_settlement_results
    select 'needs_reauthentication', public.settle_ai_task(
      '80000000-0000-4000-8000-00000000000a',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-00000000000a',
      'fail', 'authentication_required', 'Sign in again', null, false
    )
  $$,
  'authentication failure settles to needs reauthentication'
);

select lives_ok(
  $$
    insert into task_3_settlement_results
    select 'usage_limit_reached', public.settle_ai_task(
      '80000000-0000-4000-8000-00000000000b',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-00000000000b',
      'fail', 'usage_limit_reached', 'Try later', null, false
    )
  $$,
  'usage failure settles to usage limit reached'
);

select ok(
  (
    select status = 'completed'
      and result_json = '{"text":"Done"}'
      and error_code is null
    from public.ai_tasks
    where id = '80000000-0000-4000-8000-000000000008'
  ),
  'completion records the result and clears error fields'
);

select ok(
  (
    select status = 'needs_review'
      and result_json = '{"draft":"Partial"}'
      and error_code = 'malformed_output'
      and error_message = 'Malformed output'
    from public.ai_tasks
    where id = '80000000-0000-4000-8000-000000000009'
  ),
  'review settlement records canonical partial result and error fields'
);

select is(
  (
    select status from public.ai_tasks
    where id = '80000000-0000-4000-8000-00000000000a'
  ),
  'needs_reauthentication'::public.ai_task_status,
  'authentication_required maps to needs_reauthentication'
);

select is(
  (
    select status from public.ai_tasks
    where id = '80000000-0000-4000-8000-00000000000b'
  ),
  'usage_limit_reached'::public.ai_task_status,
  'usage_limit_reached maps to its resumable status'
);

select lives_ok(
  $$
    insert into task_3_settlement_results
    select 'completed-replay', public.settle_ai_task(
      '80000000-0000-4000-8000-000000000008',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000008',
      'complete', null, null, '{"text":"Done"}', false
    )
  $$,
  'an identical completed settlement replays'
);

select lives_ok(
  $$
    insert into task_3_settlement_results
    select 'needs-review-replay', public.settle_ai_task(
      '80000000-0000-4000-8000-000000000009',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000009',
      'fail', 'malformed_output', 'Malformed output',
      '{"draft":"Partial"}', true
    )
  $$,
  'an identical needs-review settlement replays'
);

select lives_ok(
  $$
    insert into task_3_settlement_results
    select 'reauthentication-replay', public.settle_ai_task(
      '80000000-0000-4000-8000-00000000000a',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-00000000000a',
      'fail', 'authentication_required', 'Sign in again', null, false
    )
  $$,
  'an identical reauthentication settlement replays'
);

select lives_ok(
  $$
    insert into task_3_settlement_results
    select 'usage-limit-replay', public.settle_ai_task(
      '80000000-0000-4000-8000-00000000000b',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-00000000000b',
      'fail', 'usage_limit_reached', 'Try later', null, false
    )
  $$,
  'an identical usage-limit settlement replays'
);

select is(
  (
    select status from task_3_settlement_results
    where label = 'completed-replay'
  ),
  'completed'::public.ai_task_status,
  'completed replay returns the recorded status'
);

select is(
  (
    select status from task_3_settlement_results
    where label = 'needs-review-replay'
  ),
  'needs_review'::public.ai_task_status,
  'needs-review replay returns the recorded status'
);

select is(
  (
    select status from task_3_settlement_results
    where label = 'reauthentication-replay'
  ),
  'needs_reauthentication'::public.ai_task_status,
  'reauthentication replay returns the recorded status'
);

select is(
  (
    select status from task_3_settlement_results
    where label = 'usage-limit-replay'
  ),
  'usage_limit_reached'::public.ai_task_status,
  'usage-limit replay returns the recorded status'
);

select throws_ok(
  $$
    select public.settle_ai_task(
      '80000000-0000-4000-8000-000000000008',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000008',
      'complete', null, null, '{"text":"Different"}', false
    )
  $$,
  'P0001', 'conflicting_ai_task_settlement',
  'a completed replay with different canonical content conflicts'
);

select throws_ok(
  $$
    select public.settle_ai_task(
      '80000000-0000-4000-8000-000000000009',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000009',
      'fail', 'malformed_output', 'Different message',
      '{"draft":"Partial"}', true
    )
  $$,
  'P0001', 'conflicting_ai_task_settlement',
  'a needs-review replay with different canonical content conflicts'
);

select throws_ok(
  $$
    select public.settle_ai_task(
      '80000000-0000-4000-8000-00000000000a',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-00000000000a',
      'complete', 'authentication_required', 'Sign in again', null, false
    )
  $$,
  'P0001', 'conflicting_ai_task_settlement',
  'a reauthentication replay with a different operation conflicts'
);

select throws_ok(
  $$
    select public.settle_ai_task(
      '80000000-0000-4000-8000-00000000000b',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-00000000000b',
      'fail', 'unknown', 'Try later', null, false
    )
  $$,
  'P0001', 'conflicting_ai_task_settlement',
  'a usage-limit replay with different canonical content conflicts'
);

select throws_ok(
  $$
    select public.append_ai_task_event(
      '80000000-0000-4000-8000-000000000008',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000008',
      1, 'progress', '{"label":"Settled"}'
    )
  $$,
  'P0001', 'stale_ai_task_attempt',
  'a settled attempt cannot append an event'
);

select lives_ok(
  $$
    select public.acknowledge_task_cancellation(
      '70000000-0000-4000-8000-000000000021',
      '71000000-0000-4000-8000-000000000021',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  'the assigned device can acknowledge a requested cancellation'
);

select ok(
  (
    select cancel_acknowledged_at is not null
    from public.ai_task_attempts
    where id = '71000000-0000-4000-8000-000000000021'
  ),
  'cancellation acknowledgement stamps the settled attempt'
);

insert into task_3_cancel_results
select cancel_acknowledged_at
from public.ai_task_attempts
where id = '71000000-0000-4000-8000-000000000021';

select lives_ok(
  $$
    select public.acknowledge_task_cancellation(
      '70000000-0000-4000-8000-000000000021',
      '71000000-0000-4000-8000-000000000021',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  'cancellation acknowledgement is idempotent'
);

select is(
  (
    select cancel_acknowledged_at
    from public.ai_task_attempts
    where id = '71000000-0000-4000-8000-000000000021'
  ),
  (select acknowledged_at from task_3_cancel_results),
  'an idempotent cancellation acknowledgement preserves its first timestamp'
);

select throws_ok(
  $$
    select public.acknowledge_task_cancellation(
      '70000000-0000-4000-8000-000000000021',
      '71000000-0000-4000-8000-000000000021',
      '30000000-0000-4000-8000-000000000002'
    )
  $$,
  'P0001', 'stale_ai_task_attempt',
  'another device cannot acknowledge cancellation'
);

select throws_ok(
  $$
    select public.acknowledge_task_cancellation(
      '80000000-0000-4000-8000-000000000008',
      '81000000-0000-4000-8000-000000000008',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  'P0001', 'stale_ai_task_attempt',
  'a non-cancellation settlement cannot acknowledge cancellation'
);

select lives_ok(
  $$
    insert into task_3_reaper_results
    select * from public.reap_expired_ai_task_leases()
  $$,
  'expired unsettled attempts are reaped'
);

select ok(
  exists (
    select 1 from task_3_reaper_results
    where task_id = '80000000-0000-4000-8000-000000000006'
      and outcome = 'waiting_for_device'
  ),
  'a no-event expiry is observable as waiting_for_device'
);

select ok(
  exists (
    select 1 from task_3_reaper_results
    where task_id = '80000000-0000-4000-8000-000000000007'
      and outcome = 'needs_review'
  ),
  'an eventful expiry is observable as needs_review'
);

select ok(
  (
    select status = 'waiting_for_device'
      and error_code is null
    from public.ai_tasks
    where id = '80000000-0000-4000-8000-000000000006'
  ),
  'a no-event expiry returns the task to waiting_for_device'
);

select ok(
  (
    select status = 'needs_review'
      and error_code = 'execution_abandoned'
    from public.ai_tasks
    where id = '80000000-0000-4000-8000-000000000007'
  ),
  'an eventful expiry records needs_review and execution_abandoned'
);

select ok(
  (
    select settled_at is not null and outcome = 'waiting_for_device'
    from public.ai_task_attempts
    where id = '81000000-0000-4000-8000-000000000006'
  ),
  'reaping settles the no-event attempt'
);

select ok(
  (
    select settled_at is not null and outcome = 'needs_review'
    from public.ai_task_attempts
    where id = '81000000-0000-4000-8000-000000000007'
  ),
  'reaping settles the eventful attempt'
);

select throws_ok(
  $$
    select public.settle_ai_task(
      '80000000-0000-4000-8000-000000000006',
      '30000000-0000-4000-8000-000000000001',
      '81000000-0000-4000-8000-000000000006',
      'complete', null, null, '{"text":"Too late"}', false
    )
  $$,
  'P0001', 'conflicting_ai_task_settlement',
  'a reaped stale attempt cannot complete'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.claim_ai_task(uuid,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.append_ai_task_event(uuid,uuid,uuid,bigint,text,jsonb)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.renew_ai_task_leases(uuid,jsonb)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.settle_ai_task(uuid,uuid,uuid,public.ai_task_settle_operation,public.task_error_code,text,jsonb,boolean)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.acknowledge_task_cancellation(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.reap_expired_ai_task_leases()',
    'EXECUTE'
  ),
  'service_role can execute every Task 3 gateway RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.claim_ai_task(uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.append_ai_task_event(uuid,uuid,uuid,bigint,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.renew_ai_task_leases(uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.settle_ai_task(uuid,uuid,uuid,public.ai_task_settle_operation,public.task_error_code,text,jsonb,boolean)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.acknowledge_task_cancellation(uuid,uuid,uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.reap_expired_ai_task_leases()',
    'EXECUTE'
  ),
  'authenticated cannot execute Task 3 gateway RPCs'
);

select * from finish();
rollback;
