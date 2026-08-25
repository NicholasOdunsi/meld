-- Chain state on a generation, and the trigger-safe task creator that queues
-- the next link. `create_design_screen_generate_task` reads `auth.uid()` and
-- refuses when there is none -- but the chain is queued from inside a
-- database trigger, where there is no JWT. Fixtures mirror
-- `design_screen_batch_materialize.test.sql`.

begin;

create extension if not exists pgtap with schema extensions;

select plan(10);

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

-- The ceiling.
update public.design_screen_generations
set chain_step = 3 where task_id = (select task_id from parent);
select is(
  public.queue_design_screen_chain_step((select task_id from parent), array['x']),
  null,
  'a parent at step 3 queues nothing -- three follow-ups, four runs in total'
);

select * from finish();
rollback;
