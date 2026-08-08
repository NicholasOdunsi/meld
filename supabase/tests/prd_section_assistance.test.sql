begin;

create extension if not exists pgtap with schema extensions;

select plan(121);

-- ---------------------------------------------------------------------------
-- Fixtures
--
-- One org, one room. U1 owns the room (edit access, added by the room-owner
-- trigger), U2 is a view-only participant, U3 is a second editor, U4 is an
-- outsider. Each of U1..U3 has an active device with a ready codex connection
-- and a saved default, so all three can create tasks.
-- ---------------------------------------------------------------------------

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('10000000-0000-4000-8000-000000000001','authenticated','authenticated','assist-owner@example.com','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Ada"}',now(),now()),
  ('10000000-0000-4000-8000-000000000002','authenticated','authenticated','assist-viewer@example.com','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Ben"}',now(),now()),
  ('10000000-0000-4000-8000-000000000003','authenticated','authenticated','assist-editor@example.com','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Cara"}',now(),now()),
  ('10000000-0000-4000-8000-000000000004','authenticated','authenticated','assist-outsider@example.com','',now(),'{"provider":"email","providers":["email"]}','{"display_name":"Dee"}',now(),now());

insert into public.organizations (id, name, created_by)
values ('20000000-0000-4000-8000-000000000001','Assist Org','10000000-0000-4000-8000-000000000001');

insert into public.memberships (organization_id, user_id, role)
values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','member'),
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','member');

insert into public.discovery_rooms (id, organization_id, name, owner_id)
values (
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','Assist Room',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.room_participants (room_id, user_id, access, added_by)
values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','view','10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','edit','10000000-0000-4000-8000-000000000001');

insert into public.execution_devices (id, user_id, name, platform, token_hash, status)
values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','Ada Mac','macos',repeat('1',64),'active'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','Ben Mac','macos',repeat('2',64),'active'),
  ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000003','Cara Mac','macos',repeat('3',64),'active');

insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values
  ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','codex','installed','authenticated','supported'),
  ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','codex','installed','authenticated','supported'),
  ('10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','codex','installed','authenticated','supported');

insert into public.ai_user_preferences (user_id, default_device_id, default_provider)
values
  ('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','codex'),
  ('10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','codex'),
  ('10000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','codex');

-- Room content the frozen manifest must capture.
insert into public.messages (id, room_id, client_id, author_id, body)
values (
  '41000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-0000000000a1',
  '10000000-0000-4000-8000-000000000001',
  'Dispatchers reassign vehicles by phone today.'
);

insert into public.attachments (
  id, room_id, message_id, uploaded_by, storage_path, original_name, mime_type,
  byte_size, extraction_status, extracted_text
)
values (
  '42000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001/notes.txt',
  'notes.txt', 'text/plain', 128, 'ready', 'Dispatch notes.'
);

insert into public.evidence (id, room_id, message_id, title, note, created_by)
values (
  '43000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'Dispatch interview', 'Reassignment is manual.',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.decisions (id, room_id, source_message_id, summary, created_by)
values (
  '44000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  'Ship reassignment before onboarding.',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.prds (
  id, room_id, organization_id, version, status, document, owner_id, created_by
)
values (
  '45000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001', 3, 'draft',
  jsonb_build_object(
    'title', 'Vehicle Reassignment',
    'executiveSummary', 'Reassign vehicles without a phone call.',
    'problemAndEvidence', 'Dispatchers reassign by phone.',
    'targetUsersAndUseCases', 'Dispatchers.',
    'goalsNonGoalsAndMetrics', 'Cut reassignment time.',
    'proposedSolution', 'A reassignment screen.',
    'userJourneys', 'Dispatcher opens the screen.',
    'functionalRequirements', jsonb_build_array('Reassign a vehicle'),
    'nonFunctionalRequirements', jsonb_build_array('Under 200ms'),
    'uxStatesAndEdgeCases', jsonb_build_array('No vehicles available'),
    'dependenciesAndConstraints', jsonb_build_array('PAMS'),
    'risksAndMitigations', jsonb_build_array(
      jsonb_build_object('risk','Double booking','mitigation','Lock the vehicle')
    ),
    'mvpScope', jsonb_build_object(
      'included', jsonb_build_array('Reassignment'),
      'excluded', jsonb_build_array('Bulk reassignment')
    ),
    'acceptanceCriteria', jsonb_build_array('A dispatcher can reassign'),
    'openQuestions', jsonb_build_array('Who audits reassignment?'),
    'decisionHistory', jsonb_build_array()
  ),
  '10000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001'
);

-- ---------------------------------------------------------------------------
-- create_prd_section_assist_task
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

-- An editor's two-section request, in rendered document order.
select lives_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[
        {"field":"problemAndEvidence","label":"Problem & evidence","quotedText":"Dispatchers reassign by phone."},
        {"field":"mvpScope","label":"MVP scope","quotedText":"Included: Reassignment"}
      ]'::jsonb,
      'Explain this and make the scope tighter.',
      '90000000-0000-4000-8000-000000000001'::uuid
    )
  $$,
  'an editor participant creates an assist task for a two-section selection'
);

select is(
  (select count(*)::int from public.ai_tasks
   where room_id = '40000000-0000-4000-8000-000000000001'
     and kind = 'prd_section_assist'),
  1,
  'creating a request queues exactly one prd_section_assist task'
);

select is(
  (select task.status::text from public.ai_tasks as task
   join public.prd_assist_requests as request on request.task_id = task.id
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  'queued',
  'the assist task is queued for the connector'
);

select is(
  (select request.can_propose_edit from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  true,
  'an editor request freezes can_propose_edit = true'
);

select is(
  (select request.status::text from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  'pending',
  'a new assist request starts pending'
);

select is(
  (select count(*)::int from public.prd_proposals
   where room_id = '40000000-0000-4000-8000-000000000001'),
  0,
  'creating a request creates no proposal yet'
);

select is(
  (select count(*)::int from public.messages
   where room_id = '40000000-0000-4000-8000-000000000001'
     and kind <> 'conversation'),
  0,
  'creating a request creates no message yet'
);

-- The RPC hands back both ids so the caller can poll either side. The result
-- is stashed in a session setting rather than compared inside one statement,
-- because a statement's snapshot predates its own writes and the row would
-- not be visible to a sibling subquery.
select set_config(
  'test.assist_payload',
  public.create_prd_section_assist_task(
    '40000000-0000-4000-8000-000000000001'::uuid,
    '[{"field":"executiveSummary","label":"Executive summary","quotedText":"Reassign vehicles"}]'::jsonb,
    'Why did we choose this?',
    '90000000-0000-4000-8000-000000000002'::uuid
  )::text,
  true
);

select ok(
  (current_setting('test.assist_payload')::jsonb ->> 'taskId')::uuid = (
    select task_id from public.prd_assist_requests
    where client_request_id = '90000000-0000-4000-8000-000000000002'
  )
  and (current_setting('test.assist_payload')::jsonb ->> 'requestId')::uuid = (
    select id from public.prd_assist_requests
    where client_request_id = '90000000-0000-4000-8000-000000000002'
  )
  and current_setting('test.assist_payload')::jsonb ->> 'kind' = 'prd_section_assist'
  and current_setting('test.assist_payload')::jsonb ->> 'status' = 'queued'
  and (current_setting('test.assist_payload')::jsonb ->> 'canProposeEdit')::boolean,
  'the RPC returns the task id, the request id, the kind, and the frozen edit right'
);

-- Frozen scope: the ordered fragments and every selected field's value.
select is(
  (select request.selected_sections from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  '[
    {"field":"problemAndEvidence","label":"Problem & evidence","quotedText":"Dispatchers reassign by phone."},
    {"field":"mvpScope","label":"MVP scope","quotedText":"Included: Reassignment"}
  ]'::jsonb,
  'the request freezes the ordered selection fragments'
);

select is(
  (select request.selected_values from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'problemAndEvidence', to_jsonb('Dispatchers reassign by phone.'::text),
    'mvpScope', jsonb_build_object(
      'included', jsonb_build_array('Reassignment'),
      'excluded', jsonb_build_array('Bulk reassignment')
    )
  ),
  'the request freezes every selected field''s current value'
);

select is(
  (select request.base_prd_id from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  '45000000-0000-4000-8000-000000000001'::uuid,
  'the request freezes the base PRD id'
);

select is(
  (select request.base_version from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  3,
  'the request freezes the base PRD version'
);

-- Frozen manifest: room content plus the assist scope and the whole PRD.
select is(
  (select task.context_manifest_json -> 'messageIds' from public.ai_tasks as task
   join public.prd_assist_requests as request on request.task_id = task.id
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  jsonb_build_array('41000000-0000-4000-8000-000000000001'),
  'the manifest freezes the room messages'
);

select is(
  (select task.context_manifest_json -> 'attachmentIds' from public.ai_tasks as task
   join public.prd_assist_requests as request on request.task_id = task.id
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  jsonb_build_array('42000000-0000-4000-8000-000000000001'),
  'the manifest freezes the room attachments'
);

select is(
  (select task.context_manifest_json -> 'evidenceIds' from public.ai_tasks as task
   join public.prd_assist_requests as request on request.task_id = task.id
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  jsonb_build_array('43000000-0000-4000-8000-000000000001'),
  'the manifest freezes the room evidence'
);

select is(
  (select task.context_manifest_json -> 'decisionIds' from public.ai_tasks as task
   join public.prd_assist_requests as request on request.task_id = task.id
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  jsonb_build_array('44000000-0000-4000-8000-000000000001'),
  'the manifest freezes the room decisions'
);

select is(
  (select task.context_manifest_json #>> '{existingPrd,document,title}'
   from public.ai_tasks as task
   join public.prd_assist_requests as request on request.task_id = task.id
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  'Vehicle Reassignment',
  'the manifest freezes the current PRD document'
);

select is(
  (select (task.context_manifest_json #>> '{existingPrd,version}')::int
   from public.ai_tasks as task
   join public.prd_assist_requests as request on request.task_id = task.id
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  3,
  'the manifest freezes the current PRD version'
);

select is(
  (select task.context_manifest_json -> 'prdAssistScope'
   from public.ai_tasks as task
   join public.prd_assist_requests as request on request.task_id = task.id
   where request.client_request_id = '90000000-0000-4000-8000-000000000001'),
  jsonb_build_object(
    'sections', '[
      {"field":"problemAndEvidence","label":"Problem & evidence","quotedText":"Dispatchers reassign by phone."},
      {"field":"mvpScope","label":"MVP scope","quotedText":"Included: Reassignment"}
    ]'::jsonb,
    'canProposeEdit', true
  ),
  'the manifest freezes the ordered assist scope and the edit right'
);

-- A view-only participant may ask, but never with edit rights.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select lives_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[{"field":"proposedSolution","label":"Proposed solution","quotedText":"A reassignment screen."}]'::jsonb,
      'Why did we choose this?',
      '90000000-0000-4000-8000-000000000003'::uuid
    )
  $$,
  'a view-only participant can create an assist task'
);

select is(
  (select request.can_propose_edit from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000003'),
  false,
  'a view-only request freezes can_propose_edit = false'
);

select is(
  (select (task.context_manifest_json #>> '{prdAssistScope,canProposeEdit}')::boolean
   from public.ai_tasks as task
   join public.prd_assist_requests as request on request.task_id = task.id
   where request.client_request_id = '90000000-0000-4000-8000-000000000003'),
  false,
  'a view-only scope tells the provider it may not propose'
);

-- An outsider cannot create anything.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select throws_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[{"field":"executiveSummary","label":"Executive summary","quotedText":"Reassign vehicles"}]'::jsonb,
      'Show me the PRD.',
      '90000000-0000-4000-8000-000000000004'::uuid
    )
  $$,
  'P0001', 'invalid_prd_section_assist_request',
  'a non-participant cannot create an assist task'
);

-- Scope validation.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

select throws_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[{"field":"title","label":"Title","quotedText":"Vehicle Reassignment"}]'::jsonb,
      'Rename this.',
      '90000000-0000-4000-8000-000000000005'::uuid
    )
  $$,
  'P0001', 'invalid_prd_section_assist_request',
  'a field outside the PRD section allowlist is rejected'
);

select throws_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[
        {"field":"mvpScope","label":"MVP scope","quotedText":"Included"},
        {"field":"mvpScope","label":"MVP scope","quotedText":"Excluded"}
      ]'::jsonb,
      'Rewrite this.',
      '90000000-0000-4000-8000-000000000006'::uuid
    )
  $$,
  'P0001', 'invalid_prd_section_assist_request',
  'a duplicate field is rejected'
);

select throws_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[
        {"field":"mvpScope","label":"MVP scope","quotedText":"Included"},
        {"field":"problemAndEvidence","label":"Problem","quotedText":"Phone."}
      ]'::jsonb,
      'Rewrite this.',
      '90000000-0000-4000-8000-000000000007'::uuid
    )
  $$,
  'P0001', 'invalid_prd_section_assist_request',
  'sections outside rendered document order are rejected'
);

-- mvpScope renders before risksAndMitigations, though PRDDocumentSchema
-- declares them the other way round. The RPC must agree with the rendered
-- order, or no contiguous selection across those two could ever be sent.
select lives_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[
        {"field":"mvpScope","label":"MVP scope","quotedText":"Included"},
        {"field":"risksAndMitigations","label":"Risks","quotedText":"Double booking"}
      ]'::jsonb,
      'Explain both.',
      '90000000-0000-4000-8000-000000000008'::uuid
    )
  $$,
  'an adjacent MVP-scope-then-risks selection follows the rendered order'
);

select throws_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[]'::jsonb,
      'Rewrite this.',
      '90000000-0000-4000-8000-000000000009'::uuid
    )
  $$,
  'P0001', 'invalid_prd_section_assist_request',
  'an empty selection is rejected'
);

select throws_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[{"field":"executiveSummary","label":"Executive summary","quotedText":""}]'::jsonb,
      'Rewrite this.',
      '90000000-0000-4000-8000-00000000000a'::uuid
    )
  $$,
  'P0001', 'invalid_prd_section_assist_request',
  'an empty quoted fragment is rejected'
);

select throws_ok(
  format(
    $$
      select public.create_prd_section_assist_task(
        '40000000-0000-4000-8000-000000000001'::uuid,
        jsonb_build_array(jsonb_build_object(
          'field','executiveSummary','label','Executive summary',
          'quotedText', %L
        )),
        'Rewrite this.',
        '90000000-0000-4000-8000-00000000000b'::uuid
      )
    $$,
    repeat('x', 10001)
  ),
  'P0001', 'invalid_prd_section_assist_request',
  'a quoted fragment over 10,000 characters is rejected'
);

-- Three 9,000-character fragments are each legal, but 27,000 characters in
-- total is not.
select throws_ok(
  format(
    $$
      select public.create_prd_section_assist_task(
        '40000000-0000-4000-8000-000000000001'::uuid,
        jsonb_build_array(
          jsonb_build_object('field','executiveSummary','label','Executive summary','quotedText', %1$L),
          jsonb_build_object('field','problemAndEvidence','label','Problem','quotedText', %1$L),
          jsonb_build_object('field','targetUsersAndUseCases','label','Users','quotedText', %1$L)
        ),
        'Rewrite this.',
        '90000000-0000-4000-8000-00000000000c'::uuid
      )
    $$,
    repeat('x', 9000)
  ),
  'P0001', 'invalid_prd_section_assist_request',
  'more than 20,000 selected characters in total is rejected'
);

-- The boundaries themselves are legal: exactly 10,000 characters in one
-- fragment, and exactly 20,000 across the selection.
select lives_ok(
  format(
    $$
      select public.create_prd_section_assist_task(
        '40000000-0000-4000-8000-000000000001'::uuid,
        jsonb_build_array(jsonb_build_object(
          'field','userJourneys','label','User journeys','quotedText', %L
        )),
        'Summarize this.',
        '90000000-0000-4000-8000-000000000011'::uuid
      )
    $$,
    repeat('x', 10000)
  ),
  'a quoted fragment of exactly 10,000 characters is accepted'
);

select lives_ok(
  format(
    $$
      select public.create_prd_section_assist_task(
        '40000000-0000-4000-8000-000000000001'::uuid,
        jsonb_build_array(
          jsonb_build_object('field','functionalRequirements','label','Functional','quotedText', %1$L),
          jsonb_build_object('field','nonFunctionalRequirements','label','Non-functional','quotedText', %1$L)
        ),
        'Summarize both.',
        '90000000-0000-4000-8000-000000000012'::uuid
      )
    $$,
    repeat('x', 10000)
  ),
  'exactly 20,000 selected characters in total is accepted'
);

select throws_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '["executiveSummary"]'::jsonb,
      'Rewrite this.',
      '90000000-0000-4000-8000-000000000013'::uuid
    )
  $$,
  'P0001', 'invalid_prd_section_assist_request',
  'a selection element that is not a fragment object is rejected'
);

-- There are only 15 selectable fields, so a 16th element must repeat one; the
-- size rule has to bite before the duplicate rule for this to mean anything,
-- which is why the assertion is on the message and not merely on failure.
select throws_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[
        {"field":"executiveSummary","label":"L","quotedText":"q"},
        {"field":"problemAndEvidence","label":"L","quotedText":"q"},
        {"field":"targetUsersAndUseCases","label":"L","quotedText":"q"},
        {"field":"goalsNonGoalsAndMetrics","label":"L","quotedText":"q"},
        {"field":"proposedSolution","label":"L","quotedText":"q"},
        {"field":"userJourneys","label":"L","quotedText":"q"},
        {"field":"functionalRequirements","label":"L","quotedText":"q"},
        {"field":"nonFunctionalRequirements","label":"L","quotedText":"q"},
        {"field":"uxStatesAndEdgeCases","label":"L","quotedText":"q"},
        {"field":"dependenciesAndConstraints","label":"L","quotedText":"q"},
        {"field":"mvpScope","label":"L","quotedText":"q"},
        {"field":"risksAndMitigations","label":"L","quotedText":"q"},
        {"field":"acceptanceCriteria","label":"L","quotedText":"q"},
        {"field":"openQuestions","label":"L","quotedText":"q"},
        {"field":"decisionHistory","label":"L","quotedText":"q"},
        {"field":"decisionHistory","label":"L","quotedText":"q"}
      ]'::jsonb,
      'Rewrite everything.',
      '90000000-0000-4000-8000-00000000000d'::uuid
    )
  $$,
  'P0001', 'invalid_prd_section_assist_request',
  'more than 15 sections is rejected'
);

select lives_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[
        {"field":"executiveSummary","label":"L","quotedText":"q"},
        {"field":"problemAndEvidence","label":"L","quotedText":"q"},
        {"field":"targetUsersAndUseCases","label":"L","quotedText":"q"},
        {"field":"goalsNonGoalsAndMetrics","label":"L","quotedText":"q"},
        {"field":"proposedSolution","label":"L","quotedText":"q"},
        {"field":"userJourneys","label":"L","quotedText":"q"},
        {"field":"functionalRequirements","label":"L","quotedText":"q"},
        {"field":"nonFunctionalRequirements","label":"L","quotedText":"q"},
        {"field":"uxStatesAndEdgeCases","label":"L","quotedText":"q"},
        {"field":"dependenciesAndConstraints","label":"L","quotedText":"q"},
        {"field":"mvpScope","label":"L","quotedText":"q"},
        {"field":"risksAndMitigations","label":"L","quotedText":"q"},
        {"field":"acceptanceCriteria","label":"L","quotedText":"q"},
        {"field":"openQuestions","label":"L","quotedText":"q"},
        {"field":"decisionHistory","label":"L","quotedText":"q"}
      ]'::jsonb,
      'Explain the whole document.',
      '90000000-0000-4000-8000-00000000000e'::uuid
    )
  $$,
  'exactly 15 sections in rendered order is accepted'
);

select throws_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[{"field":"executiveSummary","label":"Executive summary","quotedText":"Reassign"}]'::jsonb,
      '   ',
      '90000000-0000-4000-8000-00000000000f'::uuid
    )
  $$,
  'P0001', 'invalid_prd_section_assist_request',
  'a blank instruction is rejected'
);

-- Idempotency is keyed by (room_id, client_request_id).
select is(
  (
    select (public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[{"field":"executiveSummary","label":"Executive summary","quotedText":"Reassign vehicles"}]'::jsonb,
      'Why did we choose this?',
      '90000000-0000-4000-8000-000000000002'::uuid
    ) ->> 'requestId')::uuid
  ),
  (select id from public.prd_assist_requests
   where client_request_id = '90000000-0000-4000-8000-000000000002'),
  'reusing a client request id returns the request it already created'
);

select is(
  (select count(*)::int from public.prd_assist_requests
   where client_request_id = '90000000-0000-4000-8000-000000000002'),
  1,
  'reusing a client request id creates no second request'
);

-- Two participants asking about the same section concurrently is not a
-- conflict: idempotency is per client request id, not per section.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000003',true);
select lives_ok(
  $$
    select public.create_prd_section_assist_task(
      '40000000-0000-4000-8000-000000000001'::uuid,
      '[{"field":"executiveSummary","label":"Executive summary","quotedText":"Reassign vehicles"}]'::jsonb,
      'Is this still accurate?',
      '90000000-0000-4000-8000-000000000010'::uuid
    )
  $$,
  'a second participant can ask about a section another request already covers'
);

select is(
  (select count(*)::int from public.prd_assist_requests as request
   where request.room_id = '40000000-0000-4000-8000-000000000001'
     and request.selected_sections @> '[{"field":"executiveSummary"}]'::jsonb
     and request.status = 'pending'),
  3,
  'distinct requests for the same section coexist'
);

-- ---------------------------------------------------------------------------
-- Hydration
-- ---------------------------------------------------------------------------

reset role;

insert into public.ai_task_attempts (id, task_id, device_id, attempt_no, lease_expires_at)
select
  '71000000-0000-4000-8000-000000000001',
  request.task_id,
  '30000000-0000-4000-8000-000000000001',
  1,
  now() + interval '90 seconds'
from public.prd_assist_requests as request
where request.client_request_id = '90000000-0000-4000-8000-000000000001';

update public.ai_tasks set status = 'running'
where id = (
  select task_id from public.prd_assist_requests
  where client_request_id = '90000000-0000-4000-8000-000000000001'
);

select is(
  public.hydrate_authorized_room_context(
    (select task_id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000001'),
    '71000000-0000-4000-8000-000000000001'
  ) #> '{context,prdAssistScope}',
  jsonb_build_object(
    'sections', '[
      {"field":"problemAndEvidence","label":"Problem & evidence","quotedText":"Dispatchers reassign by phone."},
      {"field":"mvpScope","label":"MVP scope","quotedText":"Included: Reassignment"}
    ]'::jsonb,
    'canProposeEdit', true
  ),
  'an assist task hydrates its frozen assist scope'
);

select is(
  public.hydrate_authorized_room_context(
    (select task_id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000001'),
    '71000000-0000-4000-8000-000000000001'
  ) #>> '{context,existingPrd,document,title}',
  'Vehicle Reassignment',
  'an assist task hydrates the frozen PRD document'
);

-- A normal room reply must now see the whole PRD, not a title-only summary.
insert into public.ai_tasks (
  id, initiating_user_id, organization_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json
)
values (
  '70000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'codex', 'room_reply', 'running', 'Is the PRD ready?',
  '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
);

insert into public.ai_task_attempts (id, task_id, device_id, attempt_no, lease_expires_at)
values (
  '71000000-0000-4000-8000-000000000099',
  '70000000-0000-4000-8000-000000000099',
  '30000000-0000-4000-8000-000000000001', 1, now() + interval '90 seconds'
);

select is(
  public.hydrate_authorized_room_context(
    '70000000-0000-4000-8000-000000000099',
    '71000000-0000-4000-8000-000000000099'
  ) #>> '{context,existingPrd,document,proposedSolution}',
  'A reassignment screen.',
  'a room reply hydrates the full current PRD document'
);

select is(
  (public.hydrate_authorized_room_context(
    '70000000-0000-4000-8000-000000000099',
    '71000000-0000-4000-8000-000000000099'
  ) #>> '{context,existingPrd,version}')::int,
  3,
  'a room reply hydrates the current PRD version'
);

select is(
  public.hydrate_authorized_room_context(
    '70000000-0000-4000-8000-000000000099',
    '71000000-0000-4000-8000-000000000099'
  ) ->> 'status',
  'ready',
  'the hydrated room-reply context stays within the context-size guard'
);

-- ---------------------------------------------------------------------------
-- Settlement materializer
--
-- Settlement is simulated the way prds.test.sql and materialize_prd_revise
-- .test.sql simulate it: writing the terminal status and the result envelope
-- onto ai_tasks, which is exactly what settle_ai_task does and what the
-- trigger keys off.
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"executiveSummary","label":"Executive summary","quotedText":"Reassign vehicles"}]'::jsonb,
  'Why did we choose this?',
  '90000000-0000-4000-8000-000000000020'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"problemAndEvidence","label":"Problem & evidence","quotedText":"Dispatchers reassign by phone."}]'::jsonb,
  'Rewrite this for small fleets.',
  '90000000-0000-4000-8000-000000000021'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[
    {"field":"targetUsersAndUseCases","label":"Target users","quotedText":"Dispatchers."},
    {"field":"goalsNonGoalsAndMetrics","label":"Goals","quotedText":"Cut reassignment time."}
  ]'::jsonb,
  'Explain this and make the goals clearer.',
  '90000000-0000-4000-8000-000000000022'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"userJourneys","label":"User journeys","quotedText":"Dispatcher opens the screen."}]'::jsonb,
  'Fix this.',
  '90000000-0000-4000-8000-000000000023'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"proposedSolution","label":"Proposed solution","quotedText":"A reassignment screen."}]'::jsonb,
  'Tighten this up.',
  '90000000-0000-4000-8000-000000000024'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"nonFunctionalRequirements","label":"Non-functional","quotedText":"Under 200ms"}]'::jsonb,
  'What backs this up?',
  '90000000-0000-4000-8000-000000000025'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"acceptanceCriteria","label":"Acceptance criteria","quotedText":"A dispatcher can reassign"}]'::jsonb,
  'Make these testable.',
  '90000000-0000-4000-8000-000000000027'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"acceptanceCriteria","label":"Acceptance criteria","quotedText":"A dispatcher can reassign"}]'::jsonb,
  'Explain these and sharpen them.',
  '90000000-0000-4000-8000-000000000028'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"dependenciesAndConstraints","label":"Dependencies","quotedText":"PAMS"}]'::jsonb,
  'Is PAMS still required?',
  '90000000-0000-4000-8000-000000000029'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"openQuestions","label":"Open questions","quotedText":"Who audits reassignment?"}]'::jsonb,
  'Answer this one.',
  '90000000-0000-4000-8000-00000000002a'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"decisionHistory","label":"Decision history","quotedText":"Ship reassignment first"}]'::jsonb,
  'Explain this and record the rationale.',
  '90000000-0000-4000-8000-00000000002b'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"risksAndMitigations","label":"Risks","quotedText":"Double booking"}]'::jsonb,
  'Rewrite the mitigation.',
  '90000000-0000-4000-8000-00000000002c'::uuid
);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"targetUsersAndUseCases","label":"Target users","quotedText":"Dispatchers."}]'::jsonb,
  'Who else uses this?',
  '90000000-0000-4000-8000-00000000002d'::uuid
);

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select public.create_prd_section_assist_task(
  '40000000-0000-4000-8000-000000000001'::uuid,
  '[{"field":"uxStatesAndEdgeCases","label":"UX states","quotedText":"No vehicles available"}]'::jsonb,
  'Explain this and rewrite it.',
  '90000000-0000-4000-8000-000000000026'::uuid
);

reset role;

-- Answer only.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer','We chose it because dispatchers asked for it.',
    'proposal', null,
    'clarifyingQuestion', null,
    'citedMessageIds', jsonb_build_array('41000000-0000-4000-8000-000000000001'),
    'citedEvidenceIds', jsonb_build_array('43000000-0000-4000-8000-000000000001'),
    'assumptions', jsonb_build_array('Fleet size is under 50.'),
    'suggestedNextQuestions', jsonb_build_array('Should we cover bulk reassignment?')
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000020');

select is(
  (select status::text from public.prd_assist_requests
   where client_request_id = '90000000-0000-4000-8000-000000000020'),
  'ready',
  'answer-only settlement marks the request ready'
);

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000020')),
  2,
  'answer-only settlement creates exactly two contextual messages'
);

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000020')
     and kind = 'prd_context'),
  2,
  'both messages are prd_context messages'
);

select is(
  (select count(*)::int from public.prd_proposals
   where assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000020')),
  0,
  'answer-only settlement creates no proposal'
);

-- The human half: the requester authors it, and it carries the frozen scope.
select is(
  (select message.author_id from public.messages as message
   join public.prd_assist_requests as request on request.id = message.prd_assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000020'
     and message.author_type = 'human'),
  '10000000-0000-4000-8000-000000000001'::uuid,
  'the contextual question is authored by the requester'
);

select is(
  (select message.body from public.messages as message
   join public.prd_assist_requests as request on request.id = message.prd_assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000020'
     and message.author_type = 'human'),
  'Why did we choose this?',
  'the contextual question carries the instruction as its body'
);

select is(
  (select message.prd_context from public.messages as message
   join public.prd_assist_requests as request on request.id = message.prd_assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000020'
     and message.author_type = 'human'),
  '[{"field":"executiveSummary","label":"Executive summary","quotedText":"Reassign vehicles"}]'::jsonb,
  'the contextual question carries the frozen fragments on the row'
);

select is(
  (select message.prd_version from public.messages as message
   join public.prd_assist_requests as request on request.id = message.prd_assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000020'
     and message.author_type = 'human'),
  3,
  'the contextual question names the frozen PRD version'
);

-- The Product Agent half: normal room-reply provenance.
select is(
  (select message.body from public.messages as message
   join public.prd_assist_requests as request on request.id = message.prd_assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000020'
     and message.author_type = 'product_agent'),
  'We chose it because dispatchers asked for it.',
  'the Product Agent message carries the answer'
);

select ok(
  (select message.ai_task_id = request.task_id
     and message.initiated_by = request.created_by
     and message.provider = 'codex'
     and message.cited_message_ids = array['41000000-0000-4000-8000-000000000001'::uuid]
     and message.cited_evidence_ids = array['43000000-0000-4000-8000-000000000001'::uuid]
     and message.assumptions = array['Fleet size is under 50.']
     and message.suggested_next_questions = array['Should we cover bulk reassignment?']
   from public.messages as message
   join public.prd_assist_requests as request on request.id = message.prd_assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000020'
     and message.author_type = 'product_agent'),
  'the Product Agent message carries task, provider, citations, assumptions and suggestions'
);

select ok(
  (select question.created_at < answer.created_at
   from public.messages as question
   join public.messages as answer
     on answer.prd_assist_request_id = question.prd_assist_request_id
     and answer.author_type = 'product_agent'
   join public.prd_assist_requests as request
     on request.id = question.prd_assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000020'
     and question.author_type = 'human'),
  'the contextual question is ordered before the Product Agent answer'
);

select ok(
  (select request.answer = 'We chose it because dispatchers asked for it.'
     and request.question_message_id is not null
     and request.answer_message_id is not null
     and request.question_message_id <> request.answer_message_id
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000020'),
  'the request records the answer and both message ids'
);

-- Edit only.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer', null,
    'proposal', jsonb_build_object(
      'targetField','problemAndEvidence',
      'value','Small fleets reassign by phone, which costs 4 minutes a call.'),
    'clarifyingQuestion', null,
    'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(),
    'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000021');

select is(
  (select count(*)::int from public.prd_proposals
   where assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000021')),
  1,
  'edit-only settlement creates exactly one proposal'
);

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000021')),
  0,
  'edit-only settlement creates no messages'
);

select ok(
  (select proposal.status = 'ready'
     and proposal.section_field = 'problemAndEvidence'
     and proposal.section_label = 'Problem & evidence'
     and proposal.quoted_text = 'Dispatchers reassign by phone.'
     and proposal.previous_value = to_jsonb('Dispatchers reassign by phone.'::text)
     and proposal.proposed_value = to_jsonb('Small fleets reassign by phone, which costs 4 minutes a call.'::text)
     and proposal.base_version = 3
     and proposal.created_by = '10000000-0000-4000-8000-000000000001'::uuid
   from public.prd_proposals as proposal
   join public.prd_assist_requests as request on request.id = proposal.assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000021'),
  'the proposal carries the frozen previous value, quoted fragment and label'
);

select is(
  (select request.proposal_id from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000021'),
  (select proposal.id from public.prd_proposals as proposal
   join public.prd_assist_requests as request on request.id = proposal.assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000021'),
  'the request points at the proposal it produced'
);

-- One request, one proposal: a second proposal for the same request is
-- unstorable even by the table owner.
select throws_ok(
  format(
    $$ insert into public.prd_proposals (
         room_id, organization_id, task_id, base_prd_id, base_version,
         section_field, section_label, instruction, previous_value,
         proposed_value, status, created_by, assist_request_id
       ) values (
         '40000000-0000-4000-8000-000000000001',
         '20000000-0000-4000-8000-000000000001',
         %L, '45000000-0000-4000-8000-000000000001', 3,
         'userJourneys', 'User journeys', 'Second edit', '"a"'::jsonb,
         '"b"'::jsonb, 'ready', '10000000-0000-4000-8000-000000000001', %L
       ) $$,
    (select task_id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000023'),
    (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000021')
  ),
  '23505',
  'duplicate key value violates unique constraint "prd_proposals_one_per_assist_request"',
  'one request cannot produce a second proposal'
);

-- Answer plus edit, in one transaction.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer','Dispatchers are the only users today.',
    'proposal', jsonb_build_object(
      'targetField','goalsNonGoalsAndMetrics',
      'value','Cut median reassignment time to under one minute.'),
    'clarifyingQuestion', null,
    'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(),
    'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000022');

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000022')),
  2,
  'mixed settlement creates two contextual messages'
);

select is(
  (select count(*)::int from public.prd_proposals
   where assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000022')),
  1,
  'mixed settlement creates one proposal alongside the messages'
);

select ok(
  (select request.status = 'ready'
     and request.answer = 'Dispatchers are the only users today.'
     and request.proposal_id is not null
     and request.proposal_error_code is null
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000022'),
  'mixed settlement records the answer and the proposal on one ready request'
);

-- A multi-section scope can produce a proposal only for a selected field.
select is(
  (select proposal.section_field from public.prd_proposals as proposal
   join public.prd_assist_requests as request on request.id = proposal.assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000022'),
  'goalsNonGoalsAndMetrics',
  'a multi-section result proposes only for the field it named in scope'
);

-- Clarification.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer', null,
    'proposal', null,
    'clarifyingQuestion','Which part of the journey should change first?',
    'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(),
    'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000023');

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000023')
     and kind = 'prd_context'),
  2,
  'clarification settlement creates two contextual messages'
);

select is(
  (select count(*)::int from public.prd_proposals
   where assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000023')),
  0,
  'clarification settlement creates no proposal'
);

select is(
  (select message.body from public.messages as message
   join public.prd_assist_requests as request on request.id = message.prd_assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000023'
     and message.author_type = 'product_agent'),
  'Which part of the journey should change first?',
  'the clarifying question is the Product Agent message body'
);

-- A target field outside the frozen scope is a boundary violation, not a
-- degraded outcome: nothing is materialized.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer','Here is a rewrite.',
    'proposal', jsonb_build_object('targetField','openQuestions','value', jsonb_build_array('New question')),
    'clarifyingQuestion', null,
    'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(),
    'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000024');

select ok(
  (select request.status = 'failed' and request.error_code = 'security_boundary_violated'
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000024'),
  'a proposal for a field outside the frozen scope fails the settlement'
);

select is(
  (select count(*)::int from public.prd_proposals
   where assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000024')),
  0,
  'an out-of-scope target field creates no proposal'
);

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000024')),
  0,
  'an out-of-scope target field leaves no conversation residue'
);

-- Citations must be a subset of the frozen manifest.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer','Benchmarks from another room.',
    'proposal', null,
    'clarifyingQuestion', null,
    'citedMessageIds', jsonb_build_array('41000000-0000-4000-8000-0000000000ff'),
    'citedEvidenceIds', jsonb_build_array(),
    'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000025');

select ok(
  (select request.status = 'failed' and request.error_code = 'security_boundary_violated'
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000025'),
  'a citation outside the frozen manifest fails the settlement'
);

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000025')),
  0,
  'an unauthorized citation posts no message'
);

-- A view-only requester's proposal is refused defensively.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer','It covers the empty state.',
    'proposal', jsonb_build_object('targetField','uxStatesAndEdgeCases','value', jsonb_build_array('Rewritten')),
    'clarifyingQuestion', null,
    'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(),
    'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000026');

select is(
  (select count(*)::int from public.prd_proposals
   where assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000026')),
  0,
  'a view-only request never materializes a proposal'
);

select ok(
  (select request.status = 'failed' and request.proposal_error_code = 'edit_not_permitted'
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000026'),
  'a proposal for a requester who cannot edit is refused with a public-safe reason'
);

-- A view-only requester's plain question still materializes normally.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer','Because dispatchers asked for it.', 'proposal', null,
    'clarifyingQuestion', null, 'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(), 'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000003');

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000003')),
  2,
  'a view-only participant''s question and answer are both persisted'
);

-- An active proposal for the target section blocks the edit half only.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer', null,
    'proposal', jsonb_build_object('targetField','acceptanceCriteria','value', jsonb_build_array('Given a dispatcher, when...')),
    'clarifyingQuestion', null, 'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(), 'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000027');

update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer','They are the release gate.',
    'proposal', jsonb_build_object('targetField','acceptanceCriteria','value', jsonb_build_array('Sharper')),
    'clarifyingQuestion', null, 'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(), 'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000028');

select ok(
  (select request.status = 'ready'
     and request.answer = 'They are the release gate.'
     and request.proposal_id is null
     and request.proposal_error_code = 'section_has_active_proposal'
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000028'),
  'a blocked edit keeps its answer and reports a public-safe conflict reason'
);

select is(
  (select proposal.proposed_value from public.prd_proposals as proposal
   join public.prd_assist_requests as request on request.id = proposal.assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000027'),
  jsonb_build_array('Given a dispatcher, when...'),
  'the already-active proposal is neither overwritten nor replaced'
);

select is(
  (select count(*)::int from public.prd_proposals
   where room_id = '40000000-0000-4000-8000-000000000001'
     and section_field = 'acceptanceCriteria'
     and status in ('pending','ready')),
  1,
  'a blocked edit adds no second active proposal for the section'
);

-- A failed task leaves no residue.
--
-- REGRESSION: settle_ai_task fails a task in two statements exactly as it
-- completes one -- transition_ai_task flips the status alone, and only the
-- NEXT statement carries error_code (the lease reaper does the same, and
-- cancel_ai_task never writes a code at all). Settling the request on the
-- status statement would record 'unknown' for every real failure and then
-- lock the statement that carries the real reason out.
update public.ai_tasks set status = 'failed'
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000029');

select is(
  (select status::text from public.prd_assist_requests
   where client_request_id = '90000000-0000-4000-8000-000000000029'),
  'pending',
  'a failure whose error code has not landed yet leaves the request pending'
);

update public.ai_tasks
set error_code = 'provider_unavailable',
    error_message = 'codex exited 1 at /Users/someone/secret/path'
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000029');

select ok(
  (select request.status = 'failed'
     and request.error_code = 'provider_unavailable'
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000029'),
  'a failed task marks the request failed with the public-safe error code'
);

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000029')),
  0,
  'a failed task leaves no conversation residue'
);

select is(
  (select count(*)::int from public.prd_proposals
   where assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-000000000029')),
  0,
  'a failed task creates no proposal'
);

-- cancel_ai_task writes the status and never an error code, so the request
-- has to supply 'cancelled' itself rather than wait for a code that never
-- arrives.
update public.ai_tasks set status = 'cancelled', cancelled_at = now()
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-00000000002a');

select ok(
  (select request.status = 'failed' and request.error_code = 'cancelled'
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-00000000002a'),
  'a cancelled task marks the request failed even though no code is written'
);

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-00000000002a')),
  0,
  'a cancelled task leaves no conversation residue'
);

-- needs_review, needs_reauthentication and usage_limit_reached are RETRYABLE:
-- resolve_ai_task('retry') sends all three back to ready_to_run. A request
-- that failed on one of them must therefore still be able to materialize the
-- outcome of the retried run -- there is nothing to unwind, because a failed
-- request holds no messages and no proposal.
update public.ai_tasks set status = 'usage_limit_reached'
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-00000000002d');
update public.ai_tasks set error_code = 'usage_limit_reached'
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-00000000002d');

select ok(
  (select request.status = 'failed' and request.error_code = 'usage_limit_reached'
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-00000000002d'),
  'a usage-limit stop marks the request failed with its public-safe code'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.resolve_ai_task(
  (select task_id from public.prd_assist_requests
   where client_request_id = '90000000-0000-4000-8000-00000000002d'),
  'retry'
);
reset role;

update public.ai_tasks set status = 'running'
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-00000000002d');
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer','Dispatchers and their supervisors.', 'proposal', null,
    'clarifyingQuestion', null, 'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(), 'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-00000000002d');

select is(
  (select status::text from public.prd_assist_requests
   where client_request_id = '90000000-0000-4000-8000-00000000002d'),
  'ready',
  'a retried request materializes the outcome of the successful run'
);

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-00000000002d')),
  2,
  'a retried request still persists its question and answer'
);

select ok(
  (select request.error_code is null and request.answer = 'Dispatchers and their supervisors.'
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-00000000002d'),
  'a retried request clears the failure code it recorded before the retry'
);

-- Repeated settlement is a no-op, including with a different result.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer','We shipped reassignment first.',
    'proposal', jsonb_build_object('targetField','decisionHistory','value', jsonb_build_array(
      jsonb_build_object('decision','Ship reassignment first','rationale','Dispatch asked','sourceMessageIds', jsonb_build_array()))),
    'clarifyingQuestion', null, 'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(), 'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-00000000002b');

update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer','A different answer entirely.',
    'proposal', jsonb_build_object('targetField','decisionHistory','value', jsonb_build_array()),
    'clarifyingQuestion', null, 'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(), 'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-00000000002b');

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-00000000002b')),
  2,
  'settling twice does not duplicate the contextual messages'
);

select is(
  (select count(*)::int from public.prd_proposals
   where assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-00000000002b')),
  1,
  'settling twice does not duplicate the proposal'
);

select is(
  (select request.answer from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-00000000002b'),
  'We shipped reassignment first.',
  'a settled request is not rewritten by a second settlement'
);

-- REGRESSION: settle_ai_task writes a completing task in two updates --
-- transition_ai_task flips the status while result_json is still null, then a
-- second update sets result_json. Materializing only on the first update
-- would silently drop every real settlement.
update public.ai_tasks set status = 'completed'
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-00000000002c');

select is(
  (select status::text from public.prd_assist_requests
   where client_request_id = '90000000-0000-4000-8000-00000000002c'),
  'pending',
  'a status-only update with no result leaves the request pending'
);

update public.ai_tasks set result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer', null,
    'proposal', jsonb_build_object('targetField','risksAndMitigations','value', jsonb_build_array(
      jsonb_build_object('risk','Double booking','mitigation','Lock the vehicle for 30 seconds'))),
    'clarifyingQuestion', null, 'citedMessageIds', jsonb_build_array(),
    'citedEvidenceIds', jsonb_build_array(), 'assumptions', jsonb_build_array(),
    'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-00000000002c');

select is(
  (select count(*)::int from public.prd_proposals
   where assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-00000000002c')),
  1,
  'a two-step (status then result_json) settle still materializes the outcome'
);

-- An all-null result says nothing and is rejected.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer', null, 'proposal', null, 'clarifyingQuestion', null,
    'citedMessageIds', jsonb_build_array(), 'citedEvidenceIds', jsonb_build_array(),
    'assumptions', jsonb_build_array(), 'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-000000000008');

select ok(
  (select request.status = 'failed' and request.error_code = 'malformed_output'
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-000000000008'),
  'an all-null result fails settlement as malformed output'
);

-- A clarification cannot coexist with an answer or a proposal.
update public.ai_tasks set status = 'completed', result_json = jsonb_build_object(
  'kind','prd_section_assist','partial',false,
  'payload', jsonb_build_object(
    'answer','Here is the answer.', 'proposal', null,
    'clarifyingQuestion','But which section?',
    'citedMessageIds', jsonb_build_array(), 'citedEvidenceIds', jsonb_build_array(),
    'assumptions', jsonb_build_array(), 'suggestedNextQuestions', jsonb_build_array()
  ))
where id = (select task_id from public.prd_assist_requests
            where client_request_id = '90000000-0000-4000-8000-00000000000e');

select ok(
  (select request.status = 'failed' and request.error_code = 'malformed_output'
   from public.prd_assist_requests as request
   where request.client_request_id = '90000000-0000-4000-8000-00000000000e'),
  'a clarification paired with an answer fails settlement'
);

select is(
  (select count(*)::int from public.messages
   where prd_assist_request_id = (select id from public.prd_assist_requests
     where client_request_id = '90000000-0000-4000-8000-00000000000e')),
  0,
  'a contradictory result posts no message'
);

-- ---------------------------------------------------------------------------
-- Apply and discard
-- ---------------------------------------------------------------------------

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

select is(
  (select (public.apply_prd_proposal(proposal.id)).document ->> 'problemAndEvidence'
   from public.prd_proposals as proposal
   join public.prd_assist_requests as request on request.id = proposal.assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000021'),
  'Small fleets reassign by phone, which costs 4 minutes a call.',
  'applying a proposal splices its field into the live document'
);

select is(
  (select count(*)::int from public.messages
   where room_id = '40000000-0000-4000-8000-000000000001'
     and kind = 'prd_change'),
  1,
  'a successful apply inserts exactly one prd_change message'
);

select ok(
  (select message.author_type = 'human'
     and message.author_id = '10000000-0000-4000-8000-000000000001'::uuid
     and message.prd_proposal_id = proposal.id
     and message.prd_assist_request_id = request.id
     and message.prd_id = '45000000-0000-4000-8000-000000000001'::uuid
     and message.prd_version = 3
     and message.prd_context = jsonb_build_array(jsonb_build_object(
       'field','problemAndEvidence',
       'label','Problem & evidence',
       'quotedText','Dispatchers reassign by phone.'))
   from public.messages as message
   join public.prd_proposals as proposal on proposal.id = message.prd_proposal_id
   join public.prd_assist_requests as request on request.id = proposal.assist_request_id
   where message.kind = 'prd_change'
     and request.client_request_id = '90000000-0000-4000-8000-000000000021'),
  'the prd_change message links the proposal, its assist request, and the frozen section'
);

select is(
  (select proposal.status::text from public.prd_proposals as proposal
   join public.prd_assist_requests as request on request.id = proposal.assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000021'),
  'applied',
  'the applied proposal is marked applied'
);

-- Discard leaves nothing behind.
select is(
  (select (public.discard_prd_proposal(proposal.id)).status::text
   from public.prd_proposals as proposal
   join public.prd_assist_requests as request on request.id = proposal.assist_request_id
   where request.client_request_id = '90000000-0000-4000-8000-000000000022'),
  'discarded',
  'an editor can discard a proposal'
);

select is(
  (select count(*)::int from public.messages
   where room_id = '40000000-0000-4000-8000-000000000001'
     and kind = 'prd_change'),
  1,
  'discarding a proposal inserts no message'
);

-- A proposal from the still-live prd_section_revise path has no assist
-- request, and must still post its change entry.
reset role;
insert into public.ai_tasks (
  id, initiating_user_id, organization_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json, context_revision
)
values (
  '70000000-0000-4000-8000-000000000050',
  '10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'codex','prd_section_revise','completed','Trim the MVP scope.',
  '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb, 3
);

insert into public.prd_proposals (
  id, room_id, organization_id, task_id, base_prd_id, base_version,
  section_field, section_label, instruction, quoted_text, previous_value,
  proposed_value, status, created_by
)
values (
  '80000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000050',
  '45000000-0000-4000-8000-000000000001', 3,
  'mvpScope','MVP scope','Trim the MVP scope.','Included: Reassignment',
  jsonb_build_object('included', jsonb_build_array('Reassignment'),
                     'excluded', jsonb_build_array('Bulk reassignment')),
  jsonb_build_object('included', jsonb_build_array('Reassignment'),
                     'excluded', jsonb_build_array('Bulk reassignment','Scheduling')),
  'ready','10000000-0000-4000-8000-000000000001'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);

select lives_ok(
  $$ select public.apply_prd_proposal('80000000-0000-4000-8000-000000000001') $$,
  'a legacy prd_section_revise proposal still applies'
);

select ok(
  (select message.prd_assist_request_id is null and message.prd_proposal_id =
     '80000000-0000-4000-8000-000000000001'::uuid
   from public.messages as message
   where message.kind = 'prd_change'
     and message.prd_proposal_id = '80000000-0000-4000-8000-000000000001'),
  'a proposal with no assist request still posts a change entry, with a null request link'
);

-- A view-only participant can never apply.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select throws_ok(
  $$ select public.apply_prd_proposal(
       (select proposal.id from public.prd_proposals as proposal
        join public.prd_assist_requests as request on request.id = proposal.assist_request_id
        where request.client_request_id = '90000000-0000-4000-8000-00000000002b')
     ) $$,
  'P0001', 'prd_proposal_not_ready',
  'a view-only participant cannot apply a proposal'
);

-- Staleness, part one: a hand edit to the SAME field. Under lazy versioning a
-- write to the live draft does not move the version, so the version check
-- cannot see this at all -- only the frozen previous_value can. Without that
-- recheck the splice silently overwrites another editor's work.
select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select public.save_prd_version(
  '40000000-0000-4000-8000-000000000001'::uuid, 3,
  (select prd.document || jsonb_build_object('risksAndMitigations',
     jsonb_build_array(jsonb_build_object(
       'risk','Double booking','mitigation','Hand-edited by another editor')))
   from public.prds as prd
   where prd.id = '45000000-0000-4000-8000-000000000001')
);

select is(
  (select max(version) from public.prds
   where room_id = '40000000-0000-4000-8000-000000000001'),
  3,
  'a hand edit to the live draft does not move the PRD version'
);

select throws_ok(
  $$ select public.apply_prd_proposal(
       (select proposal.id from public.prd_proposals as proposal
        join public.prd_assist_requests as request on request.id = proposal.assist_request_id
        where request.client_request_id = '90000000-0000-4000-8000-00000000002c')
     ) $$,
  'P0001', 'prd_proposal_conflict',
  'applying a proposal whose frozen field value moved under it is rejected'
);

select is(
  (select count(*)::int from public.messages
   where room_id = '40000000-0000-4000-8000-000000000001'
     and kind = 'prd_change'),
  2,
  'an apply rejected on a stale field value inserts no prd_change message'
);

-- Staleness, part two: accept the live draft, then edit past it so the
-- outstanding proposals' frozen base version no longer matches.
select public.accept_prd_version('45000000-0000-4000-8000-000000000001');
select public.save_prd_version(
  '40000000-0000-4000-8000-000000000001'::uuid, 3,
  jsonb_build_object('title','Vehicle Reassignment','acceptanceCriteria',
    jsonb_build_array('Hand edited'))
);

select throws_ok(
  $$ select public.apply_prd_proposal(
       (select proposal.id from public.prd_proposals as proposal
        join public.prd_assist_requests as request on request.id = proposal.assist_request_id
        where request.client_request_id = '90000000-0000-4000-8000-000000000027')
     ) $$,
  'P0001', 'prd_proposal_conflict',
  'applying a proposal whose frozen base version moved is rejected'
);

select is(
  (select count(*)::int from public.messages
   where room_id = '40000000-0000-4000-8000-000000000001'
     and kind = 'prd_change'),
  2,
  'a rejected apply inserts no prd_change message'
);

-- ---------------------------------------------------------------------------
-- Row level security
-- ---------------------------------------------------------------------------

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000002',true);
select ok(
  (select count(*) from public.prd_assist_requests
   where room_id = '40000000-0000-4000-8000-000000000001') > 0,
  'a view-only room participant can read the room''s assist requests'
);

select ok(
  (select count(*) from public.messages
   where room_id = '40000000-0000-4000-8000-000000000001'
     and kind = 'prd_context') > 0,
  'a view-only room participant can read persisted PRD context messages'
);

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000004',true);
select is(
  (select count(*)::int from public.prd_assist_requests),
  0,
  'an outsider sees no assist requests'
);

select is(
  (select count(*)::int from public.messages
   where kind in ('prd_context','prd_change')),
  0,
  'an outsider sees no PRD context or change messages'
);

select is(
  (select count(*)::int from public.prd_proposals),
  0,
  'an outsider sees no proposals'
);

select set_config('request.jwt.claim.sub','10000000-0000-4000-8000-000000000001',true);
select throws_ok(
  $$
    insert into public.prd_assist_requests (
      room_id, organization_id, task_id, client_request_id, base_prd_id,
      base_version, selected_sections, selected_values, instruction,
      can_propose_edit, created_by
    ) values (
      '40000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001',
      '70000000-0000-4000-8000-000000000050',
      '90000000-0000-4000-8000-0000000000ff',
      '45000000-0000-4000-8000-000000000001', 3,
      '[{"field":"mvpScope","label":"MVP scope","quotedText":"q"}]'::jsonb,
      '{}'::jsonb, 'Forged', true, '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '42501', null,
  'authenticated cannot write assist requests directly'
);

select throws_ok(
  $$
    insert into public.messages (
      room_id, client_id, author_id, body, kind, prd_assist_request_id,
      prd_id, prd_version, prd_context
    ) values (
      '40000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-0000000000fe',
      '10000000-0000-4000-8000-000000000001',
      'Forged PRD context', 'prd_context',
      (select id from public.prd_assist_requests
       where client_request_id = '90000000-0000-4000-8000-000000000020'),
      '45000000-0000-4000-8000-000000000001', 3,
      '[{"field":"mvpScope","label":"MVP scope","quotedText":"q"}]'::jsonb
    )
  $$,
  '42501', null,
  'a participant cannot forge a message that claims PRD provenance'
);

select lives_ok(
  $$
    insert into public.messages (room_id, client_id, author_id, body)
    values (
      '40000000-0000-4000-8000-000000000001',
      '41000000-0000-4000-8000-0000000000fd',
      '10000000-0000-4000-8000-000000000001',
      'An ordinary post still works.'
    )
  $$,
  'an ordinary conversation post is unaffected by the PRD provenance rule'
);

select * from finish();
rollback;
