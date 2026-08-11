alter table public.projects
  add column created_by uuid references auth.users(id);

update public.projects as project
set created_by = workspace.created_by
from public.workspaces as workspace
where workspace.id = project.workspace_id;

alter table public.projects
  alter column created_by set not null;

alter table public.projects
  add constraint projects_id_workspace_key unique (id, workspace_id);

alter table public.projects
  drop constraint projects_name_check;
alter table public.projects
  add constraint projects_name_check
  check (char_length(btrim(name)) between 1 and 120);

alter table public.rooms
  add column project_id uuid;

do $$
begin
  if exists (
    select 1
    from public.workspaces as workspace
    left join public.projects as project
      on project.workspace_id = workspace.id
    group by workspace.id
    having count(project.id) <> 1
  ) then
    raise exception 'Each legacy workspace must have exactly one project';
  end if;
end;
$$;

update public.rooms as room
set project_id = project.id
from public.projects as project
where project.workspace_id = room.workspace_id;

alter table public.rooms
  alter column project_id set not null;

alter table public.rooms
  add constraint rooms_project_workspace_fk
  foreign key (project_id, workspace_id)
  references public.projects (id, workspace_id)
  on delete restrict;

drop policy "Admins can create workspace projects" on public.projects;
drop policy "Admins can update workspace projects" on public.projects;
drop policy "Admins can delete workspace projects" on public.projects;

create policy "Admins can create workspace projects"
on public.projects
for insert
to authenticated
with check (
  public.is_workspace_admin(workspace_id)
  and created_by = auth.uid()
);

create policy "Admins can update workspace project names"
on public.projects
for update
to authenticated
using (public.is_workspace_admin(workspace_id))
with check (public.is_workspace_admin(workspace_id));

create policy "Admins can delete workspace projects"
on public.projects
for delete
to authenticated
using (public.is_workspace_admin(workspace_id));

revoke update on table public.projects from authenticated;
grant update(name) on table public.projects to authenticated;

create or replace function public.protect_room_identity()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if new.workspace_id <> old.workspace_id
    or new.project_id <> old.project_id
    or new.owner_id <> old.owner_id
  then
    raise exception 'Room workspace, project, and owner cannot be changed'
      using errcode = 'P0001';
  end if;
  return new;
end;
$$;

drop function public.create_workspace_with_project(text, text, text);

create function public.create_workspace_with_project(
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

  insert into public.projects (workspace_id, name, created_by)
  values (created_workspace.id, project_name, current_user_id)
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

revoke all on function public.create_workspace_with_project(text, text, text)
  from public;
grant execute on function public.create_workspace_with_project(text, text, text)
  to authenticated;

drop function public.create_room(uuid, text);

create function public.create_room(
  target_workspace_id uuid,
  target_project_id uuid,
  room_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_room public.rooms;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  room_name := btrim(room_name);
  if room_name is null or char_length(room_name) not between 1 and 120 then
    raise exception 'Room name is invalid' using errcode = 'P0001';
  end if;

  if not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace membership required' using errcode = 'P0001';
  end if;

  if not exists (
    select 1
    from public.projects as project
    where project.id = target_project_id
      and project.workspace_id = target_workspace_id
  ) then
    raise exception 'Project does not belong to the workspace'
      using errcode = 'P0001';
  end if;

  insert into public.rooms (workspace_id, project_id, name, owner_id)
  values (
    target_workspace_id,
    target_project_id,
    room_name,
    current_user_id
  )
  returning * into created_room;

  return to_jsonb(created_room);
end;
$$;

revoke all on function public.create_room(uuid, uuid, text) from public;
grant execute on function public.create_room(uuid, uuid, text)
  to authenticated;
