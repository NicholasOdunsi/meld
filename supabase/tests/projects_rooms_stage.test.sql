begin;

create extension if not exists pgtap with schema extensions;

select plan(34);

select has_column(
  'public'::name,
  'projects'::name,
  'created_by'::name,
  'projects.created_by exists'::text
);
select col_not_null(
  'public'::name,
  'projects'::name,
  'created_by'::name,
  'projects.created_by is required'::text
);
select has_column(
  'public'::name,
  'rooms'::name,
  'project_id'::name,
  'rooms.project_id exists'::text
);
select col_not_null(
  'public'::name,
  'rooms'::name,
  'project_id'::name,
  'every room belongs to a project'::text
);
select ok(
  exists (
    select 1
    from pg_constraint as constraint_record
    where constraint_record.conrelid = 'public.projects'::regclass
      and constraint_record.conname = 'projects_id_workspace_key'
      and constraint_record.contype = 'u'
      and pg_get_constraintdef(constraint_record.oid)
        = 'UNIQUE (id, workspace_id)'
  ),
  'projects expose a composite workspace identity'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'project-admin@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'project-member@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000003', 'authenticated',
    'authenticated', 'nonparticipant-admin@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000004', 'authenticated',
    'authenticated', 'participant-admin@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

insert into public.workspaces (id, name, created_by)
values
  (
    '30000000-0000-4000-8000-000000000003',
    'Workspace A',
    auth.uid()
  ),
  (
    '30000000-0000-4000-8000-000000000004',
    'Workspace B',
    auth.uid()
  );

insert into public.projects (id, workspace_id, name, created_by)
values
  (
    '70000000-0000-4000-8000-000000000007',
    '30000000-0000-4000-8000-000000000003',
    'Mobile onboarding',
    auth.uid()
  ),
  (
    '70000000-0000-4000-8000-000000000008',
    '30000000-0000-4000-8000-000000000004',
    'Billing refresh',
    auth.uid()
  );

insert into public.memberships (workspace_id, user_id, role)
values
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000002',
    'member'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000003',
    'admin'
  ),
  (
    '30000000-0000-4000-8000-000000000003',
    '10000000-0000-4000-8000-000000000004',
    'admin'
  );

select is(
  (
    select project.created_by
    from public.projects as project
    where project.id = '70000000-0000-4000-8000-000000000007'
  ),
  auth.uid(),
  'projects.created_by records the creating admin'
);

select public.create_workspace_with_project(
  'Workspace created through RPC',
  'Seed project',
  null
);

select is(
  (
    select project.created_by
    from public.projects as project
    where project.workspace_id = (
      select workspace.id
      from public.workspaces as workspace
      where workspace.name = 'Workspace created through RPC'
    )
  ),
  auth.uid(),
  'workspace creation populates the seed project creator'
);

select lives_ok(
  $$
    select public.create_room(
      '30000000-0000-4000-8000-000000000003',
      '70000000-0000-4000-8000-000000000007',
      'Activation research'
    )
  $$,
  'workspace members can create rooms in a workspace project'
);

select is(
  (
    select room.project_id
    from public.rooms as room
    where room.name = 'Activation research'
  ),
  '70000000-0000-4000-8000-000000000007'::uuid,
  'create_room assigns the requested project'
);

select set_config(
  'test.room_id',
  (select id::text from public.rooms where name = 'Activation research'),
  true
);

select has_column(
  'public'::name,
  'rooms'::name,
  'stage'::name,
  'rooms.stage exists'::text
);

select is(
  (
    select array_agg(enumlabel::text order by enumsortorder)::text
    from pg_enum
    where enumtypid = 'public.room_stage'::regtype
  ),
  '{discovery,define,design,development}'::text,
  'room_stage has the exact lifecycle values'
);

select has_table(
  'public'::name,
  'room_stage_events'::name,
  'room stage history is durable'::text
);

select lives_ok(
  $$
    select public.set_room_stage(
      current_setting('test.room_id')::uuid,
      'define'
    )
  $$,
  'room owners can change stage'
);

select is(
  (select stage from public.rooms where name = 'Activation research'),
  'define'::public.room_stage,
  'the committed room stage is authoritative'
);

select is(
  (
    select from_stage::text || '>' || to_stage::text || '>' || changed_by::text
    from public.room_stage_events
    where room_id = current_setting('test.room_id')::uuid
  ),
  'discovery>define>10000000-0000-4000-8000-000000000001'::text,
  'the stage event records the exact transition and actor'
);

select lives_ok(
  $$
    select public.set_room_stage(
      current_setting('test.room_id')::uuid,
      'define'
    )
  $$,
  'selecting the current stage is a successful no-op'
);

select is(
  (
    select count(*)::integer
    from public.room_stage_events
    where room_id = current_setting('test.room_id')::uuid
  ),
  1,
  'same-stage selection does not append an event'
);

select lives_ok(
  $$
    select public.set_room_stage(
      current_setting('test.room_id')::uuid,
      'discovery'
    )
  $$,
  'backward room stage transitions are allowed'
);

insert into public.room_participants (room_id, user_id, access, added_by)
select
  room.id,
  participant.user_id,
  participant.access::public.room_participant_access,
  auth.uid()
from public.rooms as room
cross join (
  values
    ('10000000-0000-4000-8000-000000000002'::uuid, 'edit'::text),
    ('10000000-0000-4000-8000-000000000004'::uuid, 'view'::text)
) as participant(user_id, access)
where room.name = 'Activation research';

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $$
    select public.set_room_stage(
      current_setting('test.room_id')::uuid,
      'design'
    )
  $$,
  'P0001',
  'Room stage access required',
  'room editors cannot change stage'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000003',
  true
);

select throws_ok(
  $$
    select public.set_room_stage(
      current_setting('test.room_id')::uuid,
      'design'
    )
  $$,
  'P0001',
  'Room stage access required',
  'nonparticipant workspace admins cannot change stage'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000004',
  true
);

select lives_ok(
  $$
    select public.set_room_stage(
      current_setting('test.room_id')::uuid,
      'development'
    )
  $$,
  'participating workspace admins can change stage'
);

select throws_ok(
  $$
    update public.rooms
    set stage = 'design'
    where name = 'Activation research'
  $$,
  '42501',
  null,
  'authenticated users cannot update stage directly'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

select throws_ok(
  $$
    insert into public.rooms (
      workspace_id, project_id, name, owner_id
    ) values (
      '30000000-0000-4000-8000-000000000004',
      '70000000-0000-4000-8000-000000000007',
      'Wrong workspace',
      '10000000-0000-4000-8000-000000000001'
    )
  $$,
  '23503',
  null,
  'room project must belong to the room workspace'
);

select throws_ok(
  $$
    select public.create_room(
      '30000000-0000-4000-8000-000000000004',
      '70000000-0000-4000-8000-000000000007',
      'Wrong RPC workspace'
    )
  $$,
  'P0001',
  'Project does not belong to the workspace',
  'create_room rejects a Project from another Workspace'
);

select throws_ok(
  $$
    update public.rooms
    set project_id = '70000000-0000-4000-8000-000000000008'
    where name = 'Activation research'
  $$,
  '42501',
  null,
  'room project identity has no direct update privilege'
);

select throws_ok(
  $$
    update public.projects
    set workspace_id = '30000000-0000-4000-8000-000000000004'
    where id = '70000000-0000-4000-8000-000000000007'
  $$,
  '42501',
  null,
  'project workspace identity cannot be updated'
);

select throws_ok(
  $$
    update public.projects
    set created_by = '10000000-0000-4000-8000-000000000002'
    where id = '70000000-0000-4000-8000-000000000007'
  $$,
  '42501',
  null,
  'project creator identity cannot be updated'
);

select throws_ok(
  $$
    delete from public.projects
    where id = '70000000-0000-4000-8000-000000000007'
  $$,
  '23503',
  null,
  'a project containing rooms cannot be deleted'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select results_eq(
  $$
    select project.name
    from public.projects as project
    order by project.name
  $$,
  $$values ('Mobile onboarding'::text)$$,
  'members can read project names only in their workspace'
);

select throws_ok(
  $$
    insert into public.projects (workspace_id, name, created_by)
    values (
      '30000000-0000-4000-8000-000000000003',
      'Unauthorized project',
      auth.uid()
    )
  $$,
  '42501',
  null,
  'only workspace admins can create projects'
);

select is_empty(
  $$
    update public.projects
    set name = 'Unauthorized rename'
    where id = '70000000-0000-4000-8000-000000000007'
    returning 1
  $$,
  'only workspace admins can rename projects'
);

select is_empty(
  $$
    delete from public.projects
    where id = '70000000-0000-4000-8000-000000000007'
    returning 1
  $$,
  'only workspace admins can delete projects'
);

reset role;

select is(
  (
    select count(*)::integer
    from public.projects as project
    where project.created_by is null
  ),
  0,
  'the forward migration leaves no Project creator unpopulated'
);

select is(
  (
    select count(*)::integer
    from public.rooms as room
    left join public.projects as project
      on project.id = room.project_id
      and project.workspace_id = room.workspace_id
    where room.project_id is null or project.id is null
  ),
  0,
  'the forward migration leaves every legacy Room linked to its Workspace Project'
);

select * from finish();
rollback;
