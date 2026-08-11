begin;

create extension if not exists pgtap with schema extensions;

select plan(15);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('11000000-0000-4000-8000-000000000001','authenticated','authenticated','flow-owner@example.com','',now(),'{}','{}',now(),now()),
  ('11000000-0000-4000-8000-000000000002','authenticated','authenticated','flow-viewer@example.com','',now(),'{}','{}',now(),now()),
  ('11000000-0000-4000-8000-000000000003','authenticated','authenticated','flow-editor@example.com','',now(),'{}','{}',now(),now()),
  ('11000000-0000-4000-8000-000000000004','authenticated','authenticated','flow-outsider@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values ('21000000-0000-4000-8000-000000000001','Flow Org','11000000-0000-4000-8000-000000000001');

insert into public.memberships (workspace_id, user_id, role)
values
  ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','member'),
  ('21000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','member');

insert into public.rooms (id, workspace_id, name, owner_id)
values (
  '41000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001','Flow Room',
  '11000000-0000-4000-8000-000000000001'
);

insert into public.room_participants (room_id, user_id, access, added_by)
values
  ('41000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000002','view','11000000-0000-4000-8000-000000000001'),
  ('41000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000003','edit','11000000-0000-4000-8000-000000000001');

insert into public.execution_devices (id, user_id, name, platform, token_hash, status)
values
  ('31000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001','Owner Mac','macos',repeat('1',64),'active'),
  ('31000000-0000-4000-8000-000000000002','11000000-0000-4000-8000-000000000002','Viewer Mac','macos',repeat('2',64),'active'),
  ('31000000-0000-4000-8000-000000000003','11000000-0000-4000-8000-000000000003','Editor Mac','macos',repeat('3',64),'active');

insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values
  ('11000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','codex','installed','authenticated','supported'),
  ('11000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','codex','installed','authenticated','supported'),
  ('11000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000003','codex','installed','authenticated','supported');

insert into public.ai_user_preferences (user_id, default_device_id, default_provider)
values
  ('11000000-0000-4000-8000-000000000001','31000000-0000-4000-8000-000000000001','codex'),
  ('11000000-0000-4000-8000-000000000002','31000000-0000-4000-8000-000000000002','codex'),
  ('11000000-0000-4000-8000-000000000003','31000000-0000-4000-8000-000000000003','codex');

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);

select throws_ok(
  $$ select public.create_user_flow_generate_task('41000000-0000-4000-8000-000000000001') $$,
  'P0001', 'invalid_user_flow_generate_request',
  'a view-only participant cannot generate a flow'
);

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000003',true);
select lives_ok(
  $$ select public.create_user_flow_generate_task('41000000-0000-4000-8000-000000000001') $$,
  'an editor can generate a flow'
);

select is(
  (select count(*)::int from public.ai_tasks where kind = 'user_flow_generate'),
  1,
  'generation queues one task'
);

select is(
  (public.create_user_flow_generate_task('41000000-0000-4000-8000-000000000001')->>'id')::uuid,
  (select id from public.ai_tasks where kind = 'user_flow_generate' limit 1),
  'an active generation is idempotent per initiator'
);

select throws_ok(
  $$ select public.create_user_flow_generate_task(
    '41000000-0000-4000-8000-000000000001', null, repeat('x', 2001)
  ) $$,
  'P0001', 'invalid_user_flow_generate_request',
  'clarification is bounded to 2000 characters'
);

reset role;

insert into public.ai_tasks (
  id, initiating_user_id, workspace_id, room_id, device_id, provider, kind,
  status, instruction, context_manifest_json
)
values (
  '71000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001',
  '21000000-0000-4000-8000-000000000001',
  '41000000-0000-4000-8000-000000000001',
  '31000000-0000-4000-8000-000000000001',
  'codex','user_flow_generate','running','Generate flow.',
  '{"messageIds":[],"attachmentIds":[],"evidenceIds":[],"decisionIds":[]}'::jsonb
);

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "kind":"user_flow_generate",
      "partial":false,
      "payload":{
        "title":"Recovery",
        "summary":"Restore access",
        "nodes":[
          {"id":"start","kind":"start","label":"Start","detail":null},
          {"id":"end","kind":"end","label":"Done","detail":null}
        ],
        "edges":[{"id":"e1","from":"start","to":"end","label":null}],
        "openQuestions":[]
      }
    }'::jsonb
where id = '71000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.user_flow_generations
   where task_id = '71000000-0000-4000-8000-000000000001'),
  1,
  'completed non-partial output materializes once'
);

update public.ai_tasks set updated_at = now()
where id = '71000000-0000-4000-8000-000000000001';

select is(
  (select count(*)::int from public.user_flow_generations
   where task_id = '71000000-0000-4000-8000-000000000001'),
  1,
  'repeated completed updates do not duplicate materialization'
);

set local role authenticated;
select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000001',true);

select is(
  (select count(*)::int from public.list_unapplied_user_flow_generations(
    '41000000-0000-4000-8000-000000000001'
  )),
  1,
  'the initiator can recover an unapplied generation'
);

select ok(
  public.mark_user_flow_generation_applied('71000000-0000-4000-8000-000000000001'),
  'the initiating editor can acknowledge canvas insertion'
);

select is(
  (select count(*)::int from public.list_unapplied_user_flow_generations(
    '41000000-0000-4000-8000-000000000001'
  )),
  0,
  'an applied generation is not recovered again'
);

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000002',true);
select is(
  public.mark_user_flow_generation_applied('71000000-0000-4000-8000-000000000001'),
  false,
  'a viewer cannot acknowledge another user generation'
);

select is(
  (select count(*)::int from public.user_flow_generations),
  1,
  'a room participant can read the safe materialized table'
);

select set_config('request.jwt.claim.sub','11000000-0000-4000-8000-000000000004',true);
select is(
  (select count(*)::int from public.user_flow_generations),
  0,
  'an outsider cannot read materialized generations'
);

select is(
  (select count(*)::int from public.get_user_flow_generation(
    '71000000-0000-4000-8000-000000000001'
  )),
  0,
  'an outsider cannot read a generation through the safe RPC'
);

reset role;
set local role anon;
select set_config('request.jwt.claim.sub','',true);
select throws_ok(
  $$ select public.create_user_flow_generate_task('41000000-0000-4000-8000-000000000001') $$,
  '42501', null,
  'anonymous users cannot execute the generation RPC'
);

select * from finish();
rollback;
