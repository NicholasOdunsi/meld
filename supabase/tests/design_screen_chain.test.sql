-- Chain state on a generation, and the trigger-safe task creator that queues
-- the next link. `create_design_screen_generate_task` reads `auth.uid()` and
-- refuses when there is none -- but the chain is queued from inside a
-- database trigger, where there is no JWT. Fixtures mirror
-- `design_screen_batch_materialize.test.sql`.

begin;

create extension if not exists pgtap with schema extensions;

select plan(16);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  ('c1000000-0000-4000-8000-000000000001','authenticated','authenticated','chain-owner@example.com','',now(),'{}','{}',now(),now()),
  ('c1000000-0000-4000-8000-000000000002','authenticated','authenticated','chain-editor@example.com','',now(),'{}','{}',now(),now());

insert into public.workspaces (id, name, created_by)
values (
  'c2000000-0000-4000-8000-000000000001',
  'Chain Workspace',
  'c1000000-0000-4000-8000-000000000001'
);
insert into public.projects (id, workspace_id, name, created_by)
values (
  'c3000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'Chain Project',
  'c1000000-0000-4000-8000-000000000001'
);
insert into public.memberships (workspace_id, user_id, role)
values ('c2000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','member');
insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values (
  'c4000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'c3000000-0000-4000-8000-000000000001',
  'Chain Room',
  'c1000000-0000-4000-8000-000000000001'
);
insert into public.room_participants (room_id, user_id, access, added_by)
values ('c4000000-0000-4000-8000-000000000001','c1000000-0000-4000-8000-000000000002','edit','c1000000-0000-4000-8000-000000000001');

insert into public.design_screens (
  id, room_id, workspace_id, name, created_by
)
values (
  'c5000000-0000-4000-8000-000000000001',
  'c4000000-0000-4000-8000-000000000001',
  'c2000000-0000-4000-8000-000000000001',
  'Screen A',
  'c1000000-0000-4000-8000-000000000002'
);

insert into public.design_screens (id, room_id, workspace_id, name, created_by)
values
  ('c5000000-0000-4000-8000-000000000002','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Two','c1000000-0000-4000-8000-000000000002'),
  ('c5000000-0000-4000-8000-000000000003','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Three','c1000000-0000-4000-8000-000000000002'),
  ('c5000000-0000-4000-8000-000000000004','c4000000-0000-4000-8000-000000000001','c2000000-0000-4000-8000-000000000001','Screen Four','c1000000-0000-4000-8000-000000000002');

insert into public.execution_devices (
  id, user_id, name, platform, token_hash, status
)
values ('c6000000-0000-4000-8000-000000000002','c1000000-0000-4000-8000-000000000002','Editor Mac','macos',repeat('c',64),'active');
insert into public.provider_connections (
  user_id, device_id, provider, installation, authentication, compatibility
)
values ('c1000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000002','codex','installed','authenticated','supported');
insert into public.ai_user_preferences (
  user_id, default_device_id, default_provider
)
values ('c1000000-0000-4000-8000-000000000002','c6000000-0000-4000-8000-000000000002','codex');

select has_column('public'::name, 'design_screen_generations'::name, 'chain_id'::name,
  'design_screen_generations.chain_id exists');
select has_column('public'::name, 'design_screen_generations'::name, 'chain_remaining'::name,
  'design_screen_generations.chain_remaining exists');
select has_column('public'::name, 'design_screen_generations'::name, 'chain_step'::name,
  'design_screen_generations.chain_step exists');
select has_column('public'::name, 'design_screen_generations'::name, 'chain_total'::name,
  'design_screen_generations.chain_total exists');

-- A parent task to chain from.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000001');
reset role;

create temporary table parent as
select task_id from public.design_screen_generations
where screen_id = 'c5000000-0000-4000-8000-000000000001';

-- Make the fixture discriminating: give the parent a model that
-- `ai_user_preferences` could never produce (it carries no model column at
-- all). If the function ever re-derived provider/model/device from
-- preferences instead of copying the parent row, this value would come back
-- null and the inheritance assertion below would catch it.
update public.ai_tasks
set model = 'claude-sonnet-4-5'
where id = (select task_id from parent);

-- The queue function creates the next link.
create temporary table child as
select public.queue_design_screen_chain_step(
  (select task_id from parent), array['verify_docs','activate']
) as task_id;

select isnt((select task_id from child), null,
  'queue_design_screen_chain_step returns a new task id');

select is(
  (select instruction from public.ai_tasks where id = (select task_id from child)),
  'build these screens for the flow: verify_docs, activate',
  'the follow-up names the keys and nothing else'
);

-- Inheritance, not re-derivation: a chain started on one model stays on it.
select is(
  (select array[provider::text, coalesce(model,'-'), device_id::text]
     from public.ai_tasks where id = (select task_id from child)),
  (select array[provider::text, coalesce(model,'-'), device_id::text]
     from public.ai_tasks where id = (select task_id from parent)),
  'the follow-up inherits provider, model and device from its parent'
);

select is(
  (select chain_step from public.design_screen_generations
    where task_id = (select task_id from child)),
  1,
  'the follow-up is one step further along'
);

select is(
  (select chain_remaining from public.design_screen_generations
    where task_id = (select task_id from child)),
  array['verify_docs','activate'],
  'the follow-up carries the remaining keys'
);

-- An empty key array declines rather than queueing an empty flow.
select is(
  public.queue_design_screen_chain_step((select task_id from parent), array[]::text[]),
  null,
  'an empty key array queues nothing'
);

-- A device that has since been revoked ends the chain quietly.
update public.execution_devices
set revoked_at = now()
where id = 'c6000000-0000-4000-8000-000000000002';
select is(
  public.queue_design_screen_chain_step((select task_id from parent), array['verify_docs']),
  null,
  'a revoked device queues nothing'
);

-- The ceiling.
update public.design_screen_generations
set chain_step = 3 where task_id = (select task_id from parent);
select is(
  public.queue_design_screen_chain_step((select task_id from parent), array['x']),
  null,
  'a parent at step 3 queues nothing -- three follow-ups, four runs in total'
);

-- The scenario above revoked the editor's device to prove a revoked device
-- queues nothing. Reactivate it here -- the tests below call
-- `create_design_screen_generate_task`, which needs a live device to seed a
-- run, and this file exercises one editor throughout.
update public.execution_devices
set revoked_at = null
where id = 'c6000000-0000-4000-8000-000000000002';

-- The scenario above also called `queue_design_screen_chain_step` directly
-- to prove what one follow-up looks like, leaving a manually-made follow-up
-- task (`child`, at chain_step 1) that never runs. The tests below assert on
-- global counts and on `chain_step = 1` being unique to the run they queue,
-- so that leftover row would make both false without ever being a real bug --
-- delete it. Cascades to its design_screen_generations row.
delete from public.ai_tasks where id = (select task_id from child);

-- A completed first run with unbuilt targets queues exactly one follow-up.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000002');
reset role;

create temporary table run1 as
select task_id from public.design_screen_generations
where screen_id = 'c5000000-0000-4000-8000-000000000002';

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {"screens": [{
        "screenKey": "home",
        "markup": "<main>Home</main>",
        "styles": "main{display:block}",
        "script": null,
        "actions": [
          {"id": "a", "label": "Verify", "targetScreenKey": "verify_docs"},
          {"id": "b", "label": "Done", "targetScreenKey": "activate"}
        ]
      }]}
    }'
where id = (select task_id from run1);

select is(
  (select count(*)::integer from public.ai_tasks
    where kind = 'design_screen_generate'
      and instruction like 'build these screens for the flow:%'),
  1,
  'a completed run with unbuilt targets queues exactly one follow-up'
);

select is(
  (select chain_remaining from public.design_screen_generations
    where chain_step = 1),
  array['activate','verify_docs'],
  'the follow-up carries the keys the run linked to but did not build'
);

-- A run that builds everything it linked to queues nothing.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000003');
reset role;

update public.ai_tasks
set status = 'completed',
    result_json = '{
      "partial": false,
      "payload": {"screens": [{
        "screenKey": "solo",
        "markup": "<main>Solo</main>",
        "styles": "main{display:block}",
        "script": null,
        "actions": []
      }]}
    }'
where id = (select task_id from public.design_screen_generations
            where screen_id = 'c5000000-0000-4000-8000-000000000003');

select is(
  (select count(*)::integer from public.ai_tasks
    where kind = 'design_screen_generate'
      and instruction like 'build these screens for the flow:%'),
  1,
  'a run with nothing left over queues nothing'
);

-- A failed run queues nothing. Only `completed` chains.
set local role authenticated;
select set_config('request.jwt.claim.sub', 'c1000000-0000-4000-8000-000000000002', true);
select public.create_design_screen_generate_task('c5000000-0000-4000-8000-000000000004');
reset role;

update public.ai_tasks
set status = 'failed'
where id = (select task_id from public.design_screen_generations
            where screen_id = 'c5000000-0000-4000-8000-000000000004');

select is(
  (select count(*)::integer from public.ai_tasks
    where kind = 'design_screen_generate'
      and instruction like 'build these screens for the flow:%'),
  1,
  'a failed run queues nothing -- the chain stops, earlier screens stay'
);

select * from finish();
rollback;
