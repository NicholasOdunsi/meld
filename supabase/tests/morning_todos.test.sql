begin;

create extension if not exists pgtap with schema extensions;

select plan(26);

-- Fixtures: owner + outsider, one workspace, two projects, one room each.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('b1000000-0000-4000-8000-000000000001', 'authenticated', 'authenticated',
   'todo-owner@example.com', '', now(), '{}', '{}', now(), now()),
  ('b1000000-0000-4000-8000-000000000002', 'authenticated', 'authenticated',
   'todo-outsider@example.com', '', now(), '{}', '{}', now(), now());

insert into public.workspaces (id, name, created_by)
values ('b2000000-0000-4000-8000-000000000001', 'Todo workspace',
        'b1000000-0000-4000-8000-000000000001');

insert into public.projects (id, workspace_id, name, created_by)
values
  ('b7000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
   'Busy project', 'b1000000-0000-4000-8000-000000000001'),
  ('b7000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
   'Quiet project', 'b1000000-0000-4000-8000-000000000001');

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values
  ('b4000000-0000-4000-8000-000000000001', 'b2000000-0000-4000-8000-000000000001',
   'b7000000-0000-4000-8000-000000000001', 'Main', 'b1000000-0000-4000-8000-000000000001'),
  ('b4000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
   'b7000000-0000-4000-8000-000000000002', 'Main', 'b1000000-0000-4000-8000-000000000001');

insert into public.messages (id, room_id, client_id, author_type, author_id, body, created_at)
values ('b6000000-0000-4000-8000-000000000001', 'b4000000-0000-4000-8000-000000000001',
        'b6100000-0000-4000-8000-000000000001', 'human',
        'b1000000-0000-4000-8000-000000000001', 'We still need a pricing page.',
        now() - interval '1 hour');

-- The quiet project was read after its only (old) activity.
insert into public.messages (id, room_id, client_id, author_type, author_id, body, created_at)
values ('b6000000-0000-4000-8000-000000000002', 'b4000000-0000-4000-8000-000000000002',
        'b6100000-0000-4000-8000-000000000002', 'human',
        'b1000000-0000-4000-8000-000000000001', 'Old note.', now() - interval '3 days');
insert into public.project_briefs (project_id, workspace_id, summary, last_read_at)
values ('b7000000-0000-4000-8000-000000000002', 'b2000000-0000-4000-8000-000000000001',
        'Quiet so far.', now() - interval '1 day');

-- Privileges
select ok(not has_function_privilege('anon', 'public.list_todo_items(uuid)', 'EXECUTE'),
  'anon cannot list to-dos');
select ok(has_function_privilege('authenticated', 'public.save_todo_item(uuid,uuid,text,uuid,double precision)', 'EXECUTE'),
  'signed-in people can save to-dos');
select ok(not has_function_privilege('authenticated', 'public.morning_todo_facts(uuid,uuid,integer)', 'EXECUTE'),
  'signed-in people cannot read morning facts');
select ok(not has_function_privilege('authenticated', 'public.save_morning_todos(uuid,uuid,text,text[],timestamptz)', 'EXECUTE'),
  'signed-in people cannot write morning to-dos');
select ok(not has_table_privilege('authenticated', 'public.todo_items', 'SELECT'),
  'the to-do table is closed to direct reads');

-- Owner flow
set local role authenticated;
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000001', true);

select lives_ok($$ select public.save_todo_item(
  'b2000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
  '  Write the launch email  ', 'b7000000-0000-4000-8000-000000000001', 1) $$,
  'the owner saves a line');
select is((select text from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  'Write the launch email', 'saved text is trimmed');
select lives_ok($$ select public.save_todo_item(
  'b2000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
  'Write the launch email today', null, 1) $$,
  'the owner edits the line and clears its project');
select is((select project_id from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  null::uuid, 'the project was cleared');
select lives_ok($$ select public.save_todo_item(
  'b2000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000002',
  'Pick a pricing tier', 'b7000000-0000-4000-8000-000000000001', 2) $$,
  'the owner saves a second line');
select lives_ok($$ select public.delete_todo_items(
  'b2000000-0000-4000-8000-000000000001',
  array['b8000000-0000-4000-8000-000000000002']::uuid[]) $$,
  'the owner deletes a line');
select is((select count(*)::int from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  1, 'deleted lines leave the list');
select lives_ok($$ select public.set_todo_stage(
  'b2000000-0000-4000-8000-000000000001',
  array['b8000000-0000-4000-8000-000000000001']::uuid[], 'in_progress') $$,
  'Orchestrate moves a line to in progress');
select is((select stage from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  'in_progress', 'the line is in progress');
select lives_ok($$ select public.save_todo_item(
  'b2000000-0000-4000-8000-000000000001', 'b8000000-0000-4000-8000-000000000001',
  'Edited after orchestrating', null, 1) $$,
  'saving an in-progress line does not fail');
select is((select text from public.list_todo_items('b2000000-0000-4000-8000-000000000001')),
  'Write the launch email today', 'in-progress lines are not edited');
select throws_ok($$ select public.set_todo_stage(
  'b2000000-0000-4000-8000-000000000001', array[]::uuid[], 'archived') $$,
  '22023', null, 'unknown stages are refused');
select lives_ok($$ select public.set_my_time_zone('Africa/Lagos') $$, 'the owner sets a time zone');
select throws_ok($$ select public.set_my_time_zone('Mars/Olympus') $$,
  '22023', null, 'unknown time zones are refused');

-- Outsider
select set_config('request.jwt.claim.sub', 'b1000000-0000-4000-8000-000000000002', true);
select throws_ok($$ select * from public.list_todo_items('b2000000-0000-4000-8000-000000000001') $$,
  '42501', null, 'outsiders cannot list the owner''s to-dos');
reset role;

-- Service flow
select is((select time_zone from public.list_morning_workspaces()
           where workspace_id = 'b2000000-0000-4000-8000-000000000001'),
  'Africa/Lagos', 'the morning job sees the owner''s time zone');
select ok(public.claim_morning_run('b2000000-0000-4000-8000-000000000001', '2026-11-10'),
  'the first claim of the day wins');
select ok(not public.claim_morning_run('b2000000-0000-4000-8000-000000000001', '2026-11-10'),
  'a second claim the same day loses');
select is((select array_agg(project_name) from public.morning_todo_facts(
             'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 10)),
  array['Busy project'], 'only changed projects come back');
select is((select jsonb_array_length(facts->'known_todos') from public.morning_todo_facts(
             'b2000000-0000-4000-8000-000000000001', 'b1000000-0000-4000-8000-000000000001', 10)),
  1, 'known to-dos include the deleted line for the project');
select is(public.save_morning_todos(
  'b2000000-0000-4000-8000-000000000001', 'b7000000-0000-4000-8000-000000000001',
  'Pricing is the open thread.', array['Draft the pricing page', '   '], now()),
  1, 'blank to-dos are skipped and the rest are saved');

select * from finish();
rollback;
