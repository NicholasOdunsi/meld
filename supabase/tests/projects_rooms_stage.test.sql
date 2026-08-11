begin;

create extension if not exists pgtap with schema extensions;

select plan(21);

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
values (
  '30000000-0000-4000-8000-000000000003',
  '10000000-0000-4000-8000-000000000002',
  'member'
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
  'P0001',
  'Room workspace, project, and owner cannot be changed',
  'room project identity cannot be updated directly'
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
