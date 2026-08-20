-- Questions typed into the deck's field become rooms. They need somewhere to
-- land that is not one of the user's real projects, so every workspace gets
-- exactly one "scratch" project.
--
-- No new row is created for it. Every workspace already has exactly one
-- project made by create_workspace_with_project at signup (202608110002
-- installs the "a workspace always has at least one project" invariant), and
-- that project -- "Untitled project" -- is the one being given a job here.
--
-- Column-then-backfill-then-index, following 202608120001_project_icon.sql's
-- shape: the default keeps every existing row and the RPC's explicit column
-- list valid without a rewrite.
alter table public.projects
  add column is_scratch boolean not null default false;

-- A workspace's earliest project is the one the signup RPC made.
update public.projects as project
set is_scratch = true
where project.id = (
  select earliest.id
  from public.projects as earliest
  where earliest.workspace_id = project.workspace_id
  order by earliest.created_at asc, earliest.id asc
  limit 1
);

-- Renamed only where nobody has claimed it for real work. A workspace whose
-- owner already renamed this project and filled it keeps its name and simply
-- becomes a workspace whose scratch project is called something else.
update public.projects
set name = 'Scratch'
where is_scratch
  and name = 'Untitled project';

-- After the backfill, so the index validates the backfill rather than the
-- backfill having to dodge the index.
create unique index projects_one_scratch_per_workspace
  on public.projects (workspace_id)
  where is_scratch;

-- The signup RPC inserts with an explicit column list, so without this new
-- workspaces would take the `false` default and have no scratch project at
-- all. Signature is unchanged, so this replaces in place rather than
-- drop-and-create, and no entry in scripts/check-sql-arities.mjs changes.
create or replace function public.create_workspace_with_project(
  workspace_name text,
  project_name text,
  workspace_logo_path text default null
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_workspace public.workspaces;
  created_project public.projects;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  workspace_name := btrim(workspace_name);
  project_name := btrim(project_name);
  workspace_logo_path := nullif(btrim(workspace_logo_path), '');

  if workspace_name is null
    or char_length(workspace_name) not between 1 and 120
    or project_name is null
    or char_length(project_name) not between 1 and 120
    or (
      workspace_logo_path is not null
      and (
        char_length(workspace_logo_path) > 500
        or workspace_logo_path not like current_user_id::text || '/%'
      )
    )
  then
    raise exception 'Workspace details are invalid'
      using errcode = 'P0001';
  end if;

  insert into public.workspaces (name, logo_path, created_by)
  values (workspace_name, workspace_logo_path, current_user_id)
  returning * into created_workspace;

  insert into public.projects (workspace_id, name, created_by, is_scratch)
  values (created_workspace.id, project_name, current_user_id, true)
  returning * into created_project;

  return jsonb_build_object(
    'workspace_id', created_workspace.id,
    'workspace_name', created_workspace.name,
    'workspace_logo_path', created_workspace.logo_path,
    'project_id', created_project.id,
    'project_name', created_project.name
  );
end;
$$;
