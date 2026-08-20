begin;
select plan(12);

select has_column(
  'public'::name, 'projects'::name, 'is_scratch'::name,
  'projects.is_scratch exists'::text
);

select has_index(
  'public'::name, 'projects'::name,
  'projects_one_scratch_per_workspace'::name,
  'one scratch project per workspace is enforced by an index'::text
);

-- The index is partial: many non-scratch projects per workspace stay legal.
select is(
  (
    select count(*)::integer
    from pg_indexes
    where schemaname = 'public'
      and indexname = 'projects_one_scratch_per_workspace'
      and indexdef like '%WHERE is_scratch%'
  ),
  1,
  'the uniqueness index is partial on is_scratch'
);

-- `[db.seed] enabled = false`, and every pgTAP file rolls its own fixtures
-- back, so by the time this file runs public.workspaces is empty and the
-- 202608200001 migration's backfill already ran against zero rows. Asserting
-- against the live table would be vacuous (see 202608200001's PR review).
-- Instead, build the exact three shapes the backfill has to handle and
-- re-run its own UPDATE statements (copied verbatim from the migration)
-- against them, inside this transaction, so this test proves the backfill
-- logic itself rather than an accident of an empty table.
insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values (
  'a0000000-0000-4000-8000-000000000001', 'authenticated',
  'authenticated', 'scratch-fixture@example.com', '', now(),
  '{"provider":"email","providers":["email"]}', '{}', now(), now()
);

-- Case 1: a workspace whose sole project is still "Untitled project".
-- Case 2: a workspace whose sole project was already renamed by its owner.
-- Case 3: a workspace with more than one project; the earliest-created one
--         (not the smallest id) must be the one marked scratch.
insert into public.workspaces (id, name, created_by)
values
  (
    'b0000000-0000-4000-8000-000000000001',
    'Case 1: untitled project workspace',
    'a0000000-0000-4000-8000-000000000001'
  ),
  (
    'b0000000-0000-4000-8000-000000000002',
    'Case 2: renamed project workspace',
    'a0000000-0000-4000-8000-000000000001'
  ),
  (
    'b0000000-0000-4000-8000-000000000003',
    'Case 3: multi-project workspace',
    'a0000000-0000-4000-8000-000000000001'
  );

insert into public.projects (id, workspace_id, name, created_by, created_at)
values
  (
    'c0000000-0000-4000-8000-000000000001',
    'b0000000-0000-4000-8000-000000000001',
    'Untitled project',
    'a0000000-0000-4000-8000-000000000001',
    '2020-01-01T00:00:00Z'
  ),
  (
    'c0000000-0000-4000-8000-000000000002',
    'b0000000-0000-4000-8000-000000000002',
    'Marketing site redesign',
    'a0000000-0000-4000-8000-000000000001',
    '2020-01-01T00:00:00Z'
  ),
  (
    'c0000000-0000-4000-8000-000000000003',
    'b0000000-0000-4000-8000-000000000003',
    'Untitled project',
    'a0000000-0000-4000-8000-000000000001',
    '2020-01-01T00:00:00Z'
  ),
  (
    'c0000000-0000-4000-8000-000000000004',
    'b0000000-0000-4000-8000-000000000003',
    'Second project',
    'a0000000-0000-4000-8000-000000000001',
    '2020-06-01T00:00:00Z'
  );

-- Verbatim from 202608200001_project_scratch.sql.
update public.projects as project
set is_scratch = true
where project.id = (
  select earliest.id
  from public.projects as earliest
  where earliest.workspace_id = project.workspace_id
  order by earliest.created_at asc, earliest.id asc
  limit 1
);

update public.projects
set name = 'Scratch'
where is_scratch
  and name = 'Untitled project';

select is(
  (
    select is_scratch
    from public.projects
    where id = 'c0000000-0000-4000-8000-000000000001'
  ),
  true,
  'case 1: the sole untitled project becomes the scratch project'
);

select is(
  (
    select name
    from public.projects
    where id = 'c0000000-0000-4000-8000-000000000001'
  ),
  'Scratch',
  'case 1: a project still named "Untitled project" is renamed to "Scratch"'
);

select is(
  (
    select is_scratch
    from public.projects
    where id = 'c0000000-0000-4000-8000-000000000002'
  ),
  true,
  'case 2: a workspace''s sole project becomes the scratch project regardless of its name'
);

select is(
  (
    select name
    from public.projects
    where id = 'c0000000-0000-4000-8000-000000000002'
  ),
  'Marketing site redesign',
  'case 2: a project already renamed by its owner keeps that name'
);

select is(
  (
    select is_scratch
    from public.projects
    where id = 'c0000000-0000-4000-8000-000000000003'
  ),
  true,
  'case 3: the earliest-created project in a multi-project workspace becomes scratch'
);

select is(
  (
    select is_scratch
    from public.projects
    where id = 'c0000000-0000-4000-8000-000000000004'
  ),
  false,
  'case 3: the later project in a multi-project workspace is not scratch'
);

select is(
  (
    select count(*)::integer
    from public.workspaces as workspace
    where (
      select count(*)
      from public.projects as project
      where project.workspace_id = workspace.id
        and project.is_scratch
    ) <> 1
  ),
  0,
  'every fixture workspace has exactly one scratch project after the backfill logic runs'
);

-- Durable invariant, going forward: the partial unique index -- not just the
-- backfill -- is what actually stops a workspace from ever having two.
select throws_ok(
  $$
    insert into public.projects (workspace_id, name, created_by, is_scratch)
    values (
      'b0000000-0000-4000-8000-000000000001',
      'A second scratch project',
      'a0000000-0000-4000-8000-000000000001',
      true
    )
  $$,
  '23505',
  null,
  'the partial unique index rejects a second scratch project for the same workspace'
);

-- Durable invariant, going forward: every new workspace's signup project is
-- born scratch, not just backfilled ones.
set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  'a0000000-0000-4000-8000-000000000001',
  true
);

select public.create_workspace_with_project(
  'Case 4: workspace created through the RPC',
  'Whatever the signup form calls it',
  null
);

select is(
  (
    select project.is_scratch
    from public.projects as project
    join public.workspaces as workspace
      on workspace.id = project.workspace_id
    where workspace.name = 'Case 4: workspace created through the RPC'
  ),
  true,
  'create_workspace_with_project marks the project it inserts as scratch'
);

reset role;

select * from finish();
rollback;
