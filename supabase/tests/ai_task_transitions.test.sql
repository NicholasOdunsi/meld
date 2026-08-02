begin;

create extension if not exists pgtap with schema extensions;

select plan(240);

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

select throws_ok(
  $$
    insert into public.ai_tasks (
      id, initiating_user_id, organization_id, room_id, device_id,
      provider, kind, status, instruction, context_manifest_json
    )
    values (
      '70000000-0000-4000-8000-000000000098',
      '10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'room_reply', 'queued', E' \t\n ',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  '23514', null,
  'the table constraint rejects whitespace-only instructions'
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
      'prd_generate',
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
    select created ?& array[
      'id', 'initiatingUserId', 'organizationId', 'roomId', 'deviceId',
      'provider', 'kind', 'status', 'instruction', 'contextManifest',
      'contextRevision', 'result', 'errorCode', 'errorMessage', 'cancelledAt',
      'createdAt', 'updatedAt'
    ]
    and created ->> 'instruction' = 'Return a task shape'
    from (
      select public.create_ai_task(
        '40000000-0000-4000-8000-000000000001',
        '30000000-0000-4000-8000-000000000001',
        'codex',
        'prd_generate',
        E' \tReturn a task shape\n ',
        '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
      ) as created
    ) as normalized_creation
  ),
  'creation returns camel-case-compatible columns and a trimmed instruction'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000002',
      'codex', 'prd_generate', 'Wrong owner',
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
      'codex', 'prd_generate', 'Revoked',
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
      'codex', 'prd_generate', 'Missing provider',
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
      'codex', 'prd_generate', 'Not a participant',
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
      'codex', 'prd_generate', repeat('x', 20001),
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
      'codex', 'prd_generate', E' \t\n ',
      '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
    )
  $$,
  'P0001', null,
  'the task creation RPC rejects whitespace-only instructions'
);

select throws_ok(
  $$
    select public.create_ai_task(
      '40000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001',
      'codex', 'prd_generate', 'Too many messages',
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
      'codex', 'prd_generate', 'Too many attachments',
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
      'codex', 'prd_generate', 'Too much evidence',
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
      'codex', 'prd_generate', 'Too many decisions',
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
      'codex', 'prd_generate', 'Oversized manifest',
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
      'codex', 'prd_generate', 'Duplicate message',
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
      'codex', 'prd_generate', 'Duplicate attachment',
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
      'codex', 'prd_generate', 'Duplicate evidence',
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
      'codex', 'prd_generate', 'Duplicate decision',
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
      'codex', 'prd_generate', 'Cross-room message',
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
      'codex', 'prd_generate', 'Cross-room attachment',
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
      'codex', 'prd_generate', 'Cross-room evidence',
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
      'codex', 'prd_generate', 'Cross-room decision',
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
    -- A stage_readiness task, not room_reply: this fixture exercises the
    -- generic settlement mechanics (fingerprint, replay, conflict) with a
    -- free-form result payload. settle_ai_task only inserts a Product Agent
    -- message for a room_reply completion, and its result-payload validation
    -- would reject '{"text":"Done"}', so a room_reply here would conflate the
    -- two concerns. Exactly-once room_reply persistence is proven in
    -- room_agent_messages.test.sql.
    'codex', 'stage_readiness', 'running', 'Complete settlement',
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
      'codex', 'prd_generate', 'Forbidden service call',
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

reset role;

insert into public.room_participants (room_id, user_id, access, added_by)
values (
  '40000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'view',
  '10000000-0000-4000-8000-000000000002'
);

insert into public.attachments (
  id, room_id, uploaded_by, storage_path, original_name, mime_type,
  byte_size, caption, extraction_status, extracted_text
)
values (
  '92000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001/context.png',
  'context.png',
  'image/png',
  1024,
  'A caption supplied by the user',
  'ready',
  'Validated image extraction'
);

insert into public.attachments (
  id, room_id, uploaded_by, storage_path, original_name, mime_type,
  byte_size, extraction_status, extracted_text
)
select
  (
    '92000000-0000-4000-8000-' ||
    lpad(to_hex(attachment_number), 12, '0')
  )::uuid,
  '40000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  (
    '40000000-0000-4000-8000-000000000001/oversize-' ||
    attachment_number || '.txt'
  ),
  'oversize-' || attachment_number || '.txt',
  'text/plain',
  100000,
  'ready',
  left(
    (
      select string_agg(
        md5(
          attachment_number::text || ':' ||
          chunk_number::text || ':' || random()::text
        ),
        ''
      )
      from generate_series(1, 3200) as chunk_number
    ),
    100000
  )
from generate_series(2, 7) as attachment_number;

insert into public.ai_tasks (
  id, initiating_user_id, organization_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json
)
values
  (
    '90000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'ready_to_run', 'Hydrate authorized room context',
    '{
      "messageIds":["50000000-0000-4000-8000-000000000001"],
      "attachmentIds":["92000000-0000-4000-8000-000000000001"],
      "evidenceIds":["53000000-0000-4000-8000-000000000001"],
      "decisionIds":["54000000-0000-4000-8000-000000000001"]
    }'
  ),
  (
    '90000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'ready_to_run', 'Recheck authorization',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '90000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'ready_to_run', 'Reject oversized hydration',
    '{
      "messageIds":[],
      "attachmentIds":[
        "92000000-0000-4000-8000-000000000002",
        "92000000-0000-4000-8000-000000000003",
        "92000000-0000-4000-8000-000000000004",
        "92000000-0000-4000-8000-000000000005",
        "92000000-0000-4000-8000-000000000006",
        "92000000-0000-4000-8000-000000000007"
      ],
      "evidenceIds":[],
      "decisionIds":[]
    }'
  );

insert into public.ai_tasks (
  id, initiating_user_id, organization_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json,
  cancelled_at
)
values
  (
    '90000000-0000-4000-8000-000000000010',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'queued', 'Connected queued',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    null
  ),
  (
    '90000000-0000-4000-8000-000000000011',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'codex', 'room_reply', 'queued', 'Absent queued',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    null
  ),
  (
    '90000000-0000-4000-8000-000000000012',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'waiting_for_device', 'Reconnected waiting',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    null
  ),
  (
    '90000000-0000-4000-8000-000000000013',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'ready_to_run', 'Existing ready',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    null
  ),
  (
    '90000000-0000-4000-8000-000000000014',
    '10000000-0000-4000-8000-000000000002',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    '30000000-0000-4000-8000-000000000002',
    'codex', 'room_reply', 'ready_to_run', 'Absent ready',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    null
  ),
  (
    '90000000-0000-4000-8000-000000000015',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'cancelled', 'Pending cancellation',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    now()
  ),
  (
    '90000000-0000-4000-8000-000000000016',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'cancelled', 'Acknowledged cancellation',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    now()
  ),
  (
    '90000000-0000-4000-8000-000000000017',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'codex', 'room_reply', 'cancelled', 'Expired cancellation',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}',
    now() - interval '25 hours'
  );

insert into public.ai_task_attempts (
  id, task_id, device_id, attempt_no, started_at, lease_expires_at,
  settled_at, outcome, settle_operation, settle_fingerprint,
  cancel_requested_at, cancel_acknowledged_at
)
values
  (
    '91000000-0000-4000-8000-000000000015',
    '90000000-0000-4000-8000-000000000015',
    '30000000-0000-4000-8000-000000000001',
    1, now(), now(), now(), 'cancelled', 'cancelled',
    decode(repeat('15', 32), 'hex'), now(), null
  ),
  (
    '91000000-0000-4000-8000-000000000016',
    '90000000-0000-4000-8000-000000000016',
    '30000000-0000-4000-8000-000000000001',
    1, now(), now(), now(), 'cancelled', 'cancelled',
    decode(repeat('16', 32), 'hex'), now(), now()
  ),
  (
    '91000000-0000-4000-8000-000000000017',
    '90000000-0000-4000-8000-000000000017',
    '30000000-0000-4000-8000-000000000001',
    1, now() - interval '25 hours', now() - interval '25 hours',
    now() - interval '25 hours', 'cancelled', 'cancelled',
    decode(repeat('17', 32), 'hex'),
    now() - interval '25 hours', null
  );

create temporary table task_4_claim_results (
  label text primary key,
  payload jsonb
);
create temporary table task_4_hydration_results (
  label text primary key,
  payload jsonb
);
create temporary table task_4_dispatch_results (
  sweep integer,
  kind text,
  task_id uuid,
  device_id uuid,
  status public.ai_task_status,
  attempt_id uuid
);
create temporary table task_4_device_before as
select * from public.execution_devices
where id = '30000000-0000-4000-8000-000000000001';
create temporary table task_4_revoked_device_before as
select * from public.execution_devices
where id = '30000000-0000-4000-8000-000000000003';
create temporary table task_4_provider_before as
select * from public.provider_connections
where device_id = '30000000-0000-4000-8000-000000000001'
  and provider = 'codex';
create temporary table task_4_message_before as
select
  id,
  to_char(
    created_at at time zone 'UTC',
    'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
  ) as created_at
from public.messages
where id = '50000000-0000-4000-8000-000000000001';

grant select, insert on task_4_claim_results to service_role;
grant select, insert on task_4_hydration_results to service_role;
grant select, insert on task_4_dispatch_results to service_role;
grant select on task_4_device_before to service_role;
grant select on task_4_revoked_device_before to service_role;
grant select on task_4_provider_before to service_role;
grant select on task_4_message_before to service_role;

set local role service_role;

select is(
  public.get_ai_task_lease_seconds(),
  90,
  'the gateway reads the canonical 90-second lease'
);

select is(
  (
    select array_agg(key order by key)
    from jsonb_object_keys(
      (
        select to_jsonb(device)
        from public.get_execution_device_for_auth(
          '30000000-0000-4000-8000-000000000001'
        ) as device
      )
    ) as key
  ),
  array['id', 'status', 'token_hash', 'user_id'],
  'device authentication lookup exposes only its four required fields'
);

select ok(
  (
    select to_jsonb(device) =
      (
        select to_jsonb(snapshot)
        from task_4_device_before as snapshot
      )
    from public.execution_devices as device
    where device.id = '30000000-0000-4000-8000-000000000001'
  ),
  'device authentication lookup is read-only'
);

select is(
  (
    select count(*)::integer
    from public.get_execution_device_for_auth(
      '30000000-0000-4000-8000-000000000099'
    )
  ),
  0,
  'device authentication lookup returns no row for an unknown device'
);

select lives_ok(
  $$
    select public.record_device_connection(
      '30000000-0000-4000-8000-000000000001',
      repeat('v', 101)
    )
  $$,
  'an active non-revoked device can record a connection'
);

select ok(
  (
    select
      device.id = snapshot.id
      and device.user_id = snapshot.user_id
      and device.name = snapshot.name
      and device.platform = snapshot.platform
      and device.token_hash = snapshot.token_hash
      and device.status = snapshot.status
      and device.revoked_at is not distinct from snapshot.revoked_at
      and device.created_at = snapshot.created_at
      and device.last_seen_at is not null
      and device.connector_version = repeat('v', 100)
    from public.execution_devices as device
    cross join task_4_device_before as snapshot
    where device.id = '30000000-0000-4000-8000-000000000001'
  ),
  'connection recording changes only last-seen and capped connector version'
);

select is(
  (
    select char_length(connector_version)
    from public.execution_devices
    where id = '30000000-0000-4000-8000-000000000001'
  ),
  100,
  'connector versions are capped at 100 characters'
);

select is(
  public.record_device_connection(
    '30000000-0000-4000-8000-000000000003',
    '1.2.3'
  ),
  'revoked'::public.execution_device_status,
  'a revoked device reports its status instead of raising'
);

-- Reporting the status is only half the contract: a revoked device must not
-- have its liveness advanced by the heartbeat it was reported for.
select ok(
  (
    select
      device.last_seen_at is not distinct from snapshot.last_seen_at
      and device.connector_version
        is not distinct from snapshot.connector_version
    from public.execution_devices as device
    cross join task_4_revoked_device_before as snapshot
    where device.id = '30000000-0000-4000-8000-000000000003'
  ),
  'a revoked device advances neither last-seen nor connector version'
);

select throws_ok(
  $$
    select public.record_device_connection(
      '30000000-0000-4000-8000-000000000099',
      '1.2.3'
    )
  $$,
  'P0001', 'invalid_execution_device',
  'a device that does not exist still raises'
);

select throws_ok(
  $$
    select public.upsert_provider_connections(
      '30000000-0000-4000-8000-000000000001',
      '[
        {
          "provider":"codex",
          "installation":"failed",
          "version":"changed-before-error",
          "authentication":"signed_out",
          "compatibility":"unavailable"
        },
        {
          "provider":"claude",
          "installation":"invalid",
          "version":null,
          "authentication":"unknown",
          "compatibility":"supported"
        }
      ]'
    )
  $$,
  'P0001', 'invalid_provider_connections',
  'provider enum strings are validated before any write'
);

select throws_ok(
  $$
    select public.upsert_provider_connections(
      '30000000-0000-4000-8000-000000000001',
      '{"provider":"codex"}'
    )
  $$,
  'P0001', 'invalid_provider_connections',
  'provider updates reject non-array JSON with a controlled error'
);

select ok(
  (
    select to_jsonb(connection) =
      (
        select to_jsonb(snapshot)
        from task_4_provider_before as snapshot
      )
    from public.provider_connections as connection
    where connection.device_id = '30000000-0000-4000-8000-000000000001'
      and connection.provider = 'codex'
  ),
  'invalid provider input leaves every connection unchanged'
);

select throws_ok(
  $$
    select public.upsert_provider_connections(
      '30000000-0000-4000-8000-000000000001',
      '[
        {"provider":"codex","installation":"installed","version":"1","authentication":"authenticated","compatibility":"supported"},
        {"provider":"claude","installation":"installed","version":"1","authentication":"authenticated","compatibility":"supported"},
        {"provider":"codex","installation":"installed","version":"2","authentication":"authenticated","compatibility":"supported"}
      ]'
    )
  $$,
  'P0001', 'invalid_provider_connections',
  'provider updates accept at most two records'
);

select lives_ok(
  $$
    select public.upsert_provider_connections(
      '30000000-0000-4000-8000-000000000001',
      '[
        {
          "provider":"codex",
          "installation":"installed",
          "version":"2.0.0",
          "authentication":"authenticated",
          "compatibility":"supported",
          "storage_path":"forbidden/provider-token",
          "rawResponse":{"secret":"forbidden"}
        },
        {
          "provider":"claude",
          "installation":"not_installed",
          "version":null,
          "authentication":"signed_out",
          "compatibility":"unavailable",
          "storage_path":"also-forbidden"
        }
      ]'
    )
  $$,
  'two validated provider records can be upserted'
);

select ok(
  (
    select count(*) = 2
      and bool_and(user_id = '10000000-0000-4000-8000-000000000001')
      and bool_or(
        provider = 'codex'
        and version = '2.0.0'
        and installation = 'installed'
        and authentication = 'authenticated'
        and compatibility = 'supported'
      )
      and bool_or(
        provider = 'claude'
        and version is null
        and installation = 'not_installed'
        and authentication = 'signed_out'
        and compatibility = 'unavailable'
      )
    from public.provider_connections
    where device_id = '30000000-0000-4000-8000-000000000001'
  ),
  'provider upsert derives device ownership and stores only validated fields'
);

select ok(
  not exists (
    select 1
    from information_schema.columns
    where table_schema = 'public'
      and table_name = 'provider_connections'
      and column_name in ('storage_path', 'raw_response')
  ),
  'provider payload paths and raw responses have no persistence columns'
);

select lives_ok(
  $$
    insert into task_4_claim_results
    select 'authorized', public.claim_ai_task(
      '90000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  'the manifest task is claimed before hydration'
);

select lives_ok(
  $$
    insert into task_4_hydration_results
    select 'authorized', public.hydrate_authorized_room_context(
      '90000000-0000-4000-8000-000000000001',
      (
        select (payload ->> 'attemptId')::uuid
        from task_4_claim_results
        where label = 'authorized'
      )
    )
  $$,
  'the current claimed attempt can hydrate authorized room context'
);

select ok(
  (
    select payload ?& array['status', 'context']
    and payload ->> 'status' = 'ready'
    and payload -> 'context' ?& array[
      'taskId', 'initiatingUserId', 'organizationId', 'roomId',
      'kind', 'instruction', 'messages', 'attachments', 'evidence', 'decisions'
    ]
    and (
      select count(*) from jsonb_object_keys(payload -> 'context')
    ) = 10
    from task_4_hydration_results
    where label = 'authorized'
  ),
  'hydration emits a ready outcome with the exact camel-case package sections'
);

select ok(
  (
    select
      jsonb_array_length(payload #> '{context,messages}') = 1
      and payload #>> '{context,messages,0,id}' =
        '50000000-0000-4000-8000-000000000001'
      and payload #>> '{context,messages,0,authorName}' = 'task-owner'
      and payload #>> '{context,messages,0,text}' = 'Summarize this room.'
      and payload #>> '{context,messages,0,createdAt}' = (
        select snapshot.created_at
        from task_4_message_before as snapshot
      )
      and payload #>> '{context,messages,0,createdAt}'
        ~ '^[0-9]{4}-[0-9]{2}-[0-9]{2}T[0-9]{2}:[0-9]{2}:[0-9]{2}\.[0-9]{6}Z$'
      and payload #>> '{context,messages,0,createdAt}' not like '%+00:00'
    from task_4_hydration_results
    where label = 'authorized'
  ),
  'hydration emits only the named message with author display fallback'
);

select ok(
  (
    select
      jsonb_array_length(payload #> '{context,attachments}') = 1
      and payload #>> '{context,attachments,0,id}' =
        '92000000-0000-4000-8000-000000000001'
      and payload #>> '{context,attachments,0,name}' = 'context.png'
      and payload #>> '{context,attachments,0,mimeType}' = 'image/png'
      and payload #>> '{context,attachments,0,extractedText}' =
        'Validated image extraction'
      and payload #>> '{context,attachments,0,userCaption}' =
        'A caption supplied by the user'
    from task_4_hydration_results
    where label = 'authorized'
  ),
  'hydration emits the named ready attachment and caption'
);

select ok(
  (
    select
      payload #>> '{context,evidence,0,id}' =
        '53000000-0000-4000-8000-000000000001'
      and payload #>> '{context,evidence,0,title}' = 'Owner evidence'
      and payload #>> '{context,evidence,0,note}' =
        'Observed in the owner room'
      and payload #>> '{context,decisions,0,id}' =
        '54000000-0000-4000-8000-000000000001'
      and payload #>> '{context,decisions,0,summary}' =
        'Ship the owner-room fix'
      and payload #>> '{context,decisions,0,sourceMessageId}' =
        '50000000-0000-4000-8000-000000000001'
    from task_4_hydration_results
    where label = 'authorized'
  ),
  'hydration emits named evidence and decisions'
);

select ok(
  (
    select (payload -> 'context')::text not like '%storage_path%'
      and (payload -> 'context')::text not like '%owner.txt%'
    from task_4_hydration_results
    where label = 'authorized'
  ),
  'hydration never exposes attachment storage paths'
);

select lives_ok(
  $$
    insert into task_4_dispatch_results
    select 1, *
    from public.list_dispatchable_ai_tasks(array[
      '30000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001'
    ]::uuid[])
  $$,
  'dispatch refresh accepts and deduplicates connected device IDs'
);

select ok(
  (
    select
      (select status from public.ai_tasks where id =
        '90000000-0000-4000-8000-000000000010') = 'ready_to_run'
      and (select status from public.ai_tasks where id =
        '90000000-0000-4000-8000-000000000011') = 'waiting_for_device'
      and (select status from public.ai_tasks where id =
        '90000000-0000-4000-8000-000000000012') = 'ready_to_run'
      and (select status from public.ai_tasks where id =
        '90000000-0000-4000-8000-000000000013') = 'ready_to_run'
      and (select status from public.ai_tasks where id =
        '90000000-0000-4000-8000-000000000014') = 'waiting_for_device'
  ),
  'dispatch refresh applies all four connection-state transitions'
);

select ok(
  (
    select array_agg(task_id order by task_id) = array[
      '90000000-0000-4000-8000-000000000010'::uuid,
      '90000000-0000-4000-8000-000000000012'::uuid,
      '90000000-0000-4000-8000-000000000013'::uuid
    ]
    and bool_and(
      kind = 'available'
      and device_id = '30000000-0000-4000-8000-000000000001'
      and status = 'ready_to_run'
      and attempt_id is null
    )
    from task_4_dispatch_results
    where sweep = 1
      and kind = 'available'
      and task_id between
        '90000000-0000-4000-8000-000000000010'
        and '90000000-0000-4000-8000-000000000014'
  ),
  'dispatch returns only connected ready tasks as available'
);

select ok(
  exists (
    select 1
    from task_4_dispatch_results
    where sweep = 1
      and kind = 'cancel'
      and task_id = '90000000-0000-4000-8000-000000000015'
      and status = 'cancelled'
      and attempt_id = '91000000-0000-4000-8000-000000000015'
  )
  and not exists (
    select 1
    from task_4_dispatch_results
    where sweep = 1
      and task_id in (
        '90000000-0000-4000-8000-000000000016',
        '90000000-0000-4000-8000-000000000017'
      )
  ),
  'dispatch returns only unacknowledged cancellations inside 24 hours'
);

select lives_ok(
  $$
    insert into task_4_dispatch_results
    select 2, *
    from public.list_dispatchable_ai_tasks(array[
      '30000000-0000-4000-8000-000000000001'
    ]::uuid[])
  $$,
  'dispatch refresh is repeatable'
);

select ok(
  (
    select count(*) = 3
    from task_4_dispatch_results
    where sweep = 2
      and kind = 'available'
      and task_id in (
        '90000000-0000-4000-8000-000000000010',
        '90000000-0000-4000-8000-000000000012',
        '90000000-0000-4000-8000-000000000013'
      )
  ),
  'existing ready tasks are returned on every sweep'
);

select ok(
  exists (
    select 1
    from task_4_dispatch_results
    where sweep = 2
      and kind = 'cancel'
      and task_id = '90000000-0000-4000-8000-000000000015'
  ),
  'pending cancellation delivery repeats until acknowledged'
);

select lives_ok(
  $$
    select public.acknowledge_task_cancellation(
      '90000000-0000-4000-8000-000000000015',
      '91000000-0000-4000-8000-000000000015',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  'the pending Task 4 cancellation can be acknowledged'
);

select lives_ok(
  $$
    insert into task_4_dispatch_results
    select 3, *
    from public.list_dispatchable_ai_tasks(array[
      '30000000-0000-4000-8000-000000000001'
    ]::uuid[])
  $$,
  'dispatch refresh continues after cancellation acknowledgement'
);

select ok(
  not exists (
    select 1
    from task_4_dispatch_results
    where sweep = 3
      and kind = 'cancel'
      and task_id = '90000000-0000-4000-8000-000000000015'
  ),
  'an acknowledged cancellation is no longer dispatched'
);

select lives_ok(
  $$
    insert into task_4_claim_results
    select 'permission', public.claim_ai_task(
      '90000000-0000-4000-8000-000000000002',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  'the access-recheck task is claimed before participation changes'
);

select lives_ok(
  $$
    insert into task_4_claim_results
    select 'oversize', public.claim_ai_task(
      '90000000-0000-4000-8000-000000000003',
      '30000000-0000-4000-8000-000000000001'
    )
  $$,
  'the oversized-context task is claimed before hydration'
);

reset role;
delete from public.room_participants
where room_id = '40000000-0000-4000-8000-000000000002'
  and user_id = '10000000-0000-4000-8000-000000000001';
set local role service_role;

select is(
  public.hydrate_authorized_room_context(
    '90000000-0000-4000-8000-000000000002',
    (
      select (payload ->> 'attemptId')::uuid
      from task_4_claim_results
      where label = 'permission'
    )
  ),
  '{"status":"rejected","reason":"permission_changed"}'::jsonb,
  'hydration reports permission rejection after room access is revoked'
);

select ok(
  (
    select status = 'failed'
      and error_code = 'permission_changed'
      and result_json is null
    from public.ai_tasks
    where id = '90000000-0000-4000-8000-000000000002'
  ),
  'revoked hydration settles the task as permission_changed'
);

reset role;
insert into public.room_participants (room_id, user_id, access, added_by)
values (
  '40000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001',
  'view',
  '10000000-0000-4000-8000-000000000002'
);
set local role service_role;

select is(
  public.hydrate_authorized_room_context(
    '90000000-0000-4000-8000-000000000003',
    (
      select (payload ->> 'attemptId')::uuid
      from task_4_claim_results
      where label = 'oversize'
    )
  ),
  '{"status":"rejected","reason":"context_too_large"}'::jsonb,
  'hydration reports size rejection without emitting a context package'
);

select ok(
  (
    select status = 'failed'
      and error_code = 'unknown'
      and result_json is null
    from public.ai_tasks
    where id = '90000000-0000-4000-8000-000000000003'
  ),
  'oversized hydration settles the task with unknown'
);

select lives_ok(
  $$
    insert into task_4_dispatch_results
    select 4, *
    from public.list_dispatchable_ai_tasks(null::uuid[])
  $$,
  'a null connected-device list is treated as empty'
);

select ok(
  not exists (
    select 1
    from task_4_dispatch_results
    where sweep = 4
  )
  and (
    select bool_and(status = 'waiting_for_device')
    from public.ai_tasks
    where id in (
      '90000000-0000-4000-8000-000000000010',
      '90000000-0000-4000-8000-000000000012',
      '90000000-0000-4000-8000-000000000013'
    )
  ),
  'an empty dispatch sweep demotes ready tasks and returns no announcements'
);

-- Revocation is enforced again at every unavoidable database write boundary.
-- These fixtures deliberately bypass the public creation RPC so each guard is
-- mutation-tested against an otherwise valid task/attempt.
reset role;

insert into public.ai_tasks (
  id, initiating_user_id, organization_id, room_id, device_id,
  provider, kind, status, instruction, context_manifest_json
)
values
  (
    '90000000-0000-4000-8000-000000000018',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    'codex', 'room_reply', 'queued', 'Revoked dispatch fixture',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '90000000-0000-4000-8000-000000000019',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    'codex', 'room_reply', 'ready_to_run', 'Revoked claim fixture',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  ),
  (
    '90000000-0000-4000-8000-000000000020',
    '10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000003',
    'codex', 'room_reply', 'running', 'Revoked running fixture',
    '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'
  );

insert into public.ai_task_attempts (
  id, task_id, device_id, attempt_no, lease_expires_at
)
values (
  '91000000-0000-4000-8000-000000000020',
  '90000000-0000-4000-8000-000000000020',
  '30000000-0000-4000-8000-000000000003',
  1,
  now() + interval '1 hour'
);

create temporary table task_4_revoked_task_before as
select * from public.ai_tasks
where id = '90000000-0000-4000-8000-000000000020';
create temporary table task_4_revoked_attempt_before as
select * from public.ai_task_attempts
where id = '91000000-0000-4000-8000-000000000020';
grant select on task_4_revoked_task_before to service_role;
grant select on task_4_revoked_attempt_before to service_role;

set local role service_role;

select is(
  (
    select count(*)
    from public.list_dispatchable_ai_tasks(array[
      '30000000-0000-4000-8000-000000000003'
    ]::uuid[])
    where task_id = '90000000-0000-4000-8000-000000000018'
  ),
  0::bigint,
  'a revoked connected ID cannot cause task dispatch'
);

select is(
  (
    select status
    from public.ai_tasks
    where id = '90000000-0000-4000-8000-000000000018'
  ),
  'waiting_for_device'::public.ai_task_status,
  'dispatch keeps a revoked device task waiting'
);

select throws_ok(
  $$
    select public.claim_ai_task(
      '90000000-0000-4000-8000-000000000019',
      '30000000-0000-4000-8000-000000000003'
    )
  $$,
  'P0001', 'inactive_execution_device',
  'a revoked device cannot claim a task'
);

select throws_ok(
  $$
    select public.upsert_provider_connections(
      '30000000-0000-4000-8000-000000000003',
      '[{
        "provider":"codex",
        "installation":"installed",
        "version":"2.0.0",
        "authentication":"authenticated",
        "compatibility":"supported"
      }]'
    )
  $$,
  'P0001', 'invalid_provider_connections',
  'a revoked device cannot publish provider status'
);

select throws_ok(
  $$
    select public.hydrate_authorized_room_context(
      '90000000-0000-4000-8000-000000000020',
      '91000000-0000-4000-8000-000000000020'
    )
  $$,
  'P0001', 'stale_ai_task_attempt',
  'a revoked device cannot hydrate and run a claimed task'
);

select throws_ok(
  $$
    select public.append_ai_task_event(
      '90000000-0000-4000-8000-000000000020',
      '30000000-0000-4000-8000-000000000003',
      '91000000-0000-4000-8000-000000000020',
      1, 'text.delta', '{"text":"must not persist"}'
    )
  $$,
  'P0001', 'stale_ai_task_attempt',
  'a revoked device cannot append task events'
);

select is(
  (
    select count(*) from public.ai_task_events
    where attempt_id = '91000000-0000-4000-8000-000000000020'
  ),
  0::bigint,
  'the rejected revoked-device event inserted no row'
);

select is(
  (
    select count(*) from public.renew_ai_task_leases(
      '30000000-0000-4000-8000-000000000003',
      '[{
        "taskId":"90000000-0000-4000-8000-000000000020",
        "attemptId":"91000000-0000-4000-8000-000000000020"
      }]'
    )
  ),
  0::bigint,
  'a revoked device renews no task leases'
);

select is(
  (
    select lease_expires_at
    from public.ai_task_attempts
    where id = '91000000-0000-4000-8000-000000000020'
  ),
  now() + interval '1 hour',
  'revoked-device renewal leaves the lease deadline unchanged'
);

select throws_ok(
  $$
    select public.settle_ai_task(
      '90000000-0000-4000-8000-000000000020',
      '30000000-0000-4000-8000-000000000003',
      '91000000-0000-4000-8000-000000000020',
      'complete', null, null,
      '{"kind":"room_reply","payload":{"text":"forbidden"},"partial":false}',
      false
    )
  $$,
  'P0001', 'stale_ai_task_attempt',
  'a revoked device cannot settle a task'
);

select is(
  (
    select status from public.ai_tasks
    where id = '90000000-0000-4000-8000-000000000020'
  ),
  'running'::public.ai_task_status,
  'rejected revoked-device settlement leaves task state unchanged'
);

select ok(
  (
    select to_jsonb(task) = to_jsonb(snapshot)
    from public.ai_tasks as task
    cross join task_4_revoked_task_before as snapshot
    where task.id = '90000000-0000-4000-8000-000000000020'
  ),
  'revoked event, renewal, and settlement leave the whole task row unchanged'
);

select ok(
  (
    select to_jsonb(attempt) = to_jsonb(snapshot)
    from public.ai_task_attempts as attempt
    cross join task_4_revoked_attempt_before as snapshot
    where attempt.id = '91000000-0000-4000-8000-000000000020'
  ),
  'revoked event, renewal, and settlement leave the whole attempt unchanged'
);

reset role;
set local role authenticated;

select throws_ok(
  statement,
  '42501', null,
  'authenticated cannot ' || operation || ' ' || table_name
)
from (
  values
    ('insert'::text, 'execution_devices'::text,
      'insert into public.execution_devices default values'),
    ('update', 'execution_devices',
      'update public.execution_devices set status = status where false'),
    ('delete', 'execution_devices',
      'delete from public.execution_devices where false'),
    ('insert', 'provider_connections',
      'insert into public.provider_connections default values'),
    ('update', 'provider_connections',
      'update public.provider_connections set provider = provider where false'),
    ('delete', 'provider_connections',
      'delete from public.provider_connections where false'),
    ('insert', 'ai_tasks',
      'insert into public.ai_tasks default values'),
    ('update', 'ai_tasks',
      'update public.ai_tasks set status = status where false'),
    ('delete', 'ai_tasks',
      'delete from public.ai_tasks where false'),
    ('insert', 'ai_task_attempts',
      'insert into public.ai_task_attempts default values'),
    ('update', 'ai_task_attempts',
      'update public.ai_task_attempts set lease_expires_at = lease_expires_at where false'),
    ('delete', 'ai_task_attempts',
      'delete from public.ai_task_attempts where false'),
    ('insert', 'ai_task_events',
      'insert into public.ai_task_events default values'),
    ('update', 'ai_task_events',
      'update public.ai_task_events set payload_json = payload_json where false'),
    ('delete', 'ai_task_events',
      'delete from public.ai_task_events where false')
) as forbidden(operation, table_name, statement);

reset role;
set local role service_role;

select throws_ok(
  statement,
  '42501', null,
  'service_role cannot ' || operation || ' ' || table_name
)
from (
  values
    ('insert'::text, 'execution_devices'::text,
      'insert into public.execution_devices default values'),
    ('update', 'execution_devices',
      'update public.execution_devices set status = status where false'),
    ('delete', 'execution_devices',
      'delete from public.execution_devices where false'),
    ('insert', 'provider_connections',
      'insert into public.provider_connections default values'),
    ('update', 'provider_connections',
      'update public.provider_connections set provider = provider where false'),
    ('delete', 'provider_connections',
      'delete from public.provider_connections where false'),
    ('insert', 'ai_tasks',
      'insert into public.ai_tasks default values'),
    ('update', 'ai_tasks',
      'update public.ai_tasks set status = status where false'),
    ('delete', 'ai_tasks',
      'delete from public.ai_tasks where false'),
    ('insert', 'ai_task_attempts',
      'insert into public.ai_task_attempts default values'),
    ('update', 'ai_task_attempts',
      'update public.ai_task_attempts set lease_expires_at = lease_expires_at where false'),
    ('delete', 'ai_task_attempts',
      'delete from public.ai_task_attempts where false'),
    ('insert', 'ai_task_events',
      'insert into public.ai_task_events default values'),
    ('update', 'ai_task_events',
      'update public.ai_task_events set payload_json = payload_json where false'),
    ('delete', 'ai_task_events',
      'delete from public.ai_task_events where false')
) as forbidden(operation, table_name, statement);

select ok(
  not exists (
    select 1
    from pg_catalog.pg_proc as procedure
    cross join lateral aclexplode(
      coalesce(
        procedure.proacl,
        acldefault('f', procedure.proowner)
      )
    ) as privilege
    where procedure.pronamespace = 'public'::regnamespace
      and procedure.proname in (
        'create_ai_task',
        'cancel_ai_task',
        'resolve_ai_task',
        'get_ai_task_lease_seconds',
        'get_execution_device_for_auth',
        'record_device_connection',
        'upsert_provider_connections',
        'list_dispatchable_ai_tasks',
        'claim_ai_task',
        'hydrate_authorized_room_context',
        'append_ai_task_event',
        'renew_ai_task_leases',
        'settle_ai_task',
        'acknowledge_task_cancellation',
        'reap_expired_ai_task_leases'
      )
      and privilege.grantee = 0
      and privilege.privilege_type = 'EXECUTE'
  ),
  'PUBLIC cannot execute any AI task RPC'
);

select ok(
  has_function_privilege(
    'service_role',
    'public.get_ai_task_lease_seconds()',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.get_execution_device_for_auth(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.record_device_connection(uuid,text)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.upsert_provider_connections(uuid,jsonb)',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.list_dispatchable_ai_tasks(uuid[])',
    'EXECUTE'
  )
  and has_function_privilege(
    'service_role',
    'public.hydrate_authorized_room_context(uuid,uuid)',
    'EXECUTE'
  ),
  'service_role can execute every Task 4 gateway RPC'
);

select ok(
  not has_function_privilege(
    'authenticated',
    'public.get_ai_task_lease_seconds()',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.get_execution_device_for_auth(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.record_device_connection(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.upsert_provider_connections(uuid,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.list_dispatchable_ai_tasks(uuid[])',
    'EXECUTE'
  )
  and not has_function_privilege(
    'authenticated',
    'public.hydrate_authorized_room_context(uuid,uuid)',
    'EXECUTE'
  ),
  'authenticated cannot execute Task 4 gateway RPCs'
);

select ok(
  has_function_privilege(
    'authenticated',
    'public.create_ai_task(uuid,uuid,public.ai_provider,public.ai_task_kind,text,jsonb)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.cancel_ai_task(uuid)',
    'EXECUTE'
  )
  and has_function_privilege(
    'authenticated',
    'public.resolve_ai_task(uuid,text)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.create_ai_task(uuid,uuid,public.ai_provider,public.ai_task_kind,text,jsonb)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.cancel_ai_task(uuid)',
    'EXECUTE'
  )
  and not has_function_privilege(
    'service_role',
    'public.resolve_ai_task(uuid,text)',
    'EXECUTE'
  ),
  'authenticated-only AI task RPCs remain isolated from service_role'
);

reset role;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.append_ai_task_event(uuid,uuid,uuid,bigint,text,jsonb)'
          ::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(
    body,
    'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
  ) > 0
    and strpos(
      body,
      'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
    ) < strpos(
      body,
      'from public.ai_tasks as task where task.id = target_task_id for update'
    )
    and strpos(
      body,
      'from public.ai_tasks as task where task.id = target_task_id for update'
    ) < strpos(
      body,
      'from public.ai_task_attempts as attempt where attempt.id = target_attempt_id and attempt.task_id = target_task_id for update'
    ),
  'append locks device, task, and attempt in canonical order'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        (
          'public.settle_ai_'
          || 'task(uuid,uuid,uuid,public.ai_task_settle_operation,public.task_error_code,text,jsonb,boolean)'
        )::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(
    body,
    'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
  ) > 0
    and strpos(
      body,
      'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
    ) < strpos(
      body,
      'from public.ai_tasks as task where task.id = target_task_id for update'
    )
    and strpos(
      body,
      'from public.ai_tasks as task where task.id = target_task_id for update'
    ) < strpos(
      body,
      'from public.ai_task_attempts as attempt where attempt.id = target_attempt_id and attempt.task_id = target_task_id for update'
    ),
  'settlement locks device, task, and attempt in canonical order'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.acknowledge_task_cancellation(uuid,uuid,uuid)'
          ::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(
    body,
    'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
  ) > 0
    and strpos(
      body,
      'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
    ) < strpos(
      body,
      'from public.ai_tasks as task where task.id = target_task_id and task.device_id = target_device_id for update'
    )
    and strpos(
      body,
      'from public.ai_tasks as task where task.id = target_task_id and task.device_id = target_device_id for update'
    ) < strpos(
      body,
      'from public.ai_task_attempts as attempt where attempt.id = target_attempt_id and attempt.task_id = target_task_id for update'
    ),
  'cancellation acknowledgement locks device, task, and attempt in canonical order'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.hydrate_authorized_room_context(uuid,uuid)'::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(
    body,
    'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
  ) > 0
    and strpos(
      body,
      'from public.ai_tasks as task where task.id = target_task_id and task.device_id = target_device_id for update'
    ) > 0
    and strpos(
      body,
      'from public.ai_task_attempts as attempt where attempt.id = target_attempt_id and attempt.task_id = target_task_id for update'
    ) > 0
    and strpos(
      body,
      'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
    ) < strpos(
      body,
      'from public.ai_tasks as task where task.id = target_task_id and task.device_id = target_device_id for update'
    )
    and strpos(
      body,
      'from public.ai_tasks as task where task.id = target_task_id and task.device_id = target_device_id for update'
    ) < strpos(
      body,
      'from public.ai_task_attempts as attempt where attempt.id = target_attempt_id and attempt.task_id = target_task_id for update'
    ),
  'hydration resolves its device then locks device, task, and attempt in order'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.renew_ai_task_leases(uuid,jsonb)'::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(
    body,
    'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
  ) > 0
    and strpos(body, 'order by task.id for update of task') > 0
    and strpos(body, 'order by attempt.id for update of attempt') > 0
    and strpos(
      body,
      'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
    ) < strpos(body, 'order by task.id for update of task')
    and strpos(body, 'order by task.id for update of task')
      < strpos(body, 'order by attempt.id for update of attempt'),
  'lease renewal locks ordered tasks then ordered attempts after the device'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef('public.claim_ai_task(uuid,uuid)'::regprocedure)
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(
    body,
    'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
  ) > 0
    and strpos(
      body,
      'from public.execution_devices as device where device.id = target_device_id and device.status = ''active'' and device.revoked_at is null for update'
    ) < strpos(
      body,
      'from public.ai_tasks as task where task.id = target_task_id and task.device_id = target_device_id and task.status = ''ready_to_run'' for update skip locked'
    )
    and body like '%order by attempt.attempt_no desc limit 1%',
  'claim locks device then task and calculates attempt numbers in order'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.list_dispatchable_ai_tasks(uuid[])'::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  strpos(body, 'perform device.id from public.execution_devices as device')
      > 0
    and strpos(body, 'perform device.id from public.execution_devices as device')
      < strpos(body, 'with locked_tasks as materialized')
    and body like '%order by device.id for update%'
    and body like '%order by task.id for update%',
  'dispatch locks UUID-ordered devices before UUID-ordered tasks'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.record_device_connection(uuid,text)'::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  body like '%from public.execution_devices as device where device.id = target_device_id for update%'
    and body like '%where id = current_device.id and status = ''active'' and revoked_at is null%'
    and body like '%return current_device.status%',
  'connection recording updates only the same locked active device row'
)
from function_body;

with function_body as (
  select regexp_replace(
    lower(
      pg_get_functiondef(
        'public.revoke_execution_device(uuid)'::regprocedure
      )
    ),
    '\s+',
    ' ',
    'g'
  ) as body
)
select ok(
  body like '%from public.execution_devices as device where device.id = target_device_id and device.user_id = caller_id for update%'
    and body like '%where id = current_device.id and user_id = current_device.user_id%',
  'revocation updates the same device row it locked'
)
from function_body;

select * from finish();
rollback;
