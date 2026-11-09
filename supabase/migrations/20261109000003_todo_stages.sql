-- orion-allow-destructive
-- Todo → In progress → Completed (spec revised 2026-11-09): each line gets a
-- stage instead of handled_at. Any handled line becomes done. Dropping
-- handled_at after migrating those rows to stage = done is intentional.

alter table public.todo_items
  add column stage text not null default 'todo' check (stage in ('todo', 'in_progress', 'done')),
  add column stage_changed_at timestamptz not null default now();

update public.todo_items
set stage = 'done', stage_changed_at = handled_at
where handled_at is not null;

drop index public.todo_items_open;
create index todo_items_live on public.todo_items (workspace_id, stage, position)
  where deleted_at is null;

-- These read handled_at, so they're replaced before the column goes.
drop function public.remove_todo_items(uuid, uuid[], text);
drop function public.list_todo_items(uuid);  -- return type changes

create function public.list_todo_items(target_workspace_id uuid)
returns table (
  id uuid, project_id uuid, text text, stage text,
  "position" double precision, created_at timestamptz, stage_changed_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace not found.' using errcode = '42501';
  end if;
  return query
    select live.id, live.project_id, live.text, live.stage, live.position, live.created_at, live.stage_changed_at
    from (
      select item.*
      from public.todo_items as item
      where item.workspace_id = target_workspace_id
        and item.deleted_at is null
        and item.stage <> 'done'
      union all
      (select item.*
       from public.todo_items as item
       where item.workspace_id = target_workspace_id
         and item.deleted_at is null
         and item.stage = 'done'
       order by item.stage_changed_at desc
       limit 50)
    ) as live
    order by live.position, live.created_at;
end;
$$;

create or replace function public.save_todo_item(
  target_workspace_id uuid,
  item_id uuid,
  item_text text,
  item_project_id uuid,
  item_position double precision
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace not found.' using errcode = '42501';
  end if;
  insert into public.todo_items as item (id, workspace_id, project_id, text, author, position)
  values (item_id, target_workspace_id, item_project_id, btrim(item_text), 'owner', item_position)
  on conflict (id) do update
    set text = excluded.text,
        project_id = excluded.project_id,
        position = excluded.position,
        updated_at = now()
    where item.workspace_id = target_workspace_id
      and item.stage = 'todo'
      and item.deleted_at is null;
end;
$$;

create function public.set_todo_stage(
  target_workspace_id uuid,
  item_ids uuid[],
  new_stage text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace not found.' using errcode = '42501';
  end if;
  if new_stage not in ('todo', 'in_progress', 'done') then
    raise exception 'Unknown stage.' using errcode = '22023';
  end if;
  update public.todo_items
  set stage = new_stage, stage_changed_at = now(), updated_at = now()
  where workspace_id = target_workspace_id
    and id = any(item_ids)
    and deleted_at is null
    and stage <> new_stage;
end;
$$;

create function public.delete_todo_items(
  target_workspace_id uuid,
  item_ids uuid[]
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'Workspace not found.' using errcode = '42501';
  end if;
  update public.todo_items
  set deleted_at = now(), updated_at = now()
  where workspace_id = target_workspace_id
    and id = any(item_ids)
    and deleted_at is null;
end;
$$;

create or replace function public.morning_todo_facts(
  target_workspace_id uuid,
  target_user_id uuid,
  max_projects integer
)
returns table (
  project_id uuid,
  project_name text,
  summary text,
  since timestamptz,
  activity_count integer,
  facts jsonb
)
language sql
stable
security definer
set search_path = ''
as $$
  with project_since as (
    select project.id as project_id, project.name as project_name,
           coalesce(brief.summary, '') as summary,
           coalesce(brief.last_read_at, now() - interval '7 days') as since
    from public.projects as project
    left join public.project_briefs as brief on brief.project_id = project.id
    where project.workspace_id = target_workspace_id
  ),
  room_scope as (
    select room.id as room_id, room.name as room_name, scope.project_id, scope.since
    from public.rooms as room
    join project_since as scope on scope.project_id = room.project_id
    where room.workspace_id = target_workspace_id
  ),
  new_messages as (
    select scope.project_id, msg.created_at as at,
           jsonb_build_object(
             'room', scope.room_name,
             'from', case when msg.author_type = 'product_agent' then 'orion' else 'you' end,
             'text', left(msg.body, 2000),
             'at', msg.created_at) as fact
    from public.messages as msg
    join room_scope as scope on scope.room_id = msg.room_id
    where msg.created_at > scope.since
  ),
  new_decisions as (
    select scope.project_id, decision.created_at as at,
           jsonb_build_object('room', scope.room_name, 'summary', left(decision.summary, 1000),
                              'at', decision.created_at) as fact
    from public.decisions as decision
    join room_scope as scope on scope.room_id = decision.room_id
    where decision.created_at > scope.since
  ),
  new_prds as (
    select scope.project_id, prd.updated_at as at,
           jsonb_build_object('room', scope.room_name, 'version', prd.version,
                              'status', prd.status::text, 'at', prd.updated_at) as fact
    from public.prds as prd
    join room_scope as scope on scope.room_id = prd.room_id
    where prd.updated_at > scope.since
  ),
  new_screens as (
    select scope.project_id, screen.updated_at as at,
           jsonb_build_object('room', scope.room_name, 'name', screen.name,
                              'state', screen.state::text, 'at', screen.updated_at) as fact
    from public.design_screens as screen
    join room_scope as scope on scope.room_id = screen.room_id
    where screen.deleted_at is null and screen.updated_at > scope.since
  ),
  new_tasks as (
    select scope.project_id, task.updated_at as at,
           jsonb_build_object('room', scope.room_name, 'kind', task.kind::text,
                              'status', task.status::text, 'at', task.updated_at) as fact
    from public.ai_tasks as task
    join room_scope as scope on scope.room_id = task.room_id
    left join public.room_views as view
      on view.room_id = task.room_id and view.user_id = target_user_id
    where task.updated_at > scope.since
      and (
        task.status in ('failed', 'needs_reauthentication', 'usage_limit_reached', 'needs_review')
        or (task.status = 'completed'
            and (view.last_viewed_at is null or view.last_viewed_at < task.updated_at))
      )
  ),
  activity as (
    select project_id, count(*)::integer as n
    from (
      select project_id from new_messages
      union all select project_id from new_decisions
      union all select project_id from new_prds
      union all select project_id from new_screens
      union all select project_id from new_tasks
    ) as everything
    group by project_id
  )
  select scope.project_id, scope.project_name, scope.summary, scope.since, activity.n,
    jsonb_build_object(
      'messages', coalesce((
        select jsonb_agg(latest.fact order by latest.at desc)
        from (select fact, at from new_messages
              where new_messages.project_id = scope.project_id
              order by at desc limit 60) as latest), '[]'::jsonb),
      'decisions', coalesce((select jsonb_agg(fact order by at desc) from new_decisions
                             where new_decisions.project_id = scope.project_id), '[]'::jsonb),
      'prds', coalesce((select jsonb_agg(fact order by at desc) from new_prds
                        where new_prds.project_id = scope.project_id), '[]'::jsonb),
      'screens', coalesce((select jsonb_agg(fact order by at desc) from new_screens
                           where new_screens.project_id = scope.project_id), '[]'::jsonb),
      'tasks', coalesce((select jsonb_agg(fact order by at desc) from new_tasks
                         where new_tasks.project_id = scope.project_id), '[]'::jsonb),
      'open_todos', coalesce((
        select jsonb_agg(item.text order by item.position)
        from public.todo_items as item
        where item.workspace_id = target_workspace_id
          and item.project_id = scope.project_id
          and item.stage <> 'done' and item.deleted_at is null), '[]'::jsonb),
      'known_todos', coalesce((
        select jsonb_agg(item.text)
        from public.todo_items as item
        where item.workspace_id = target_workspace_id
          and item.project_id = scope.project_id), '[]'::jsonb)
    )
  from project_since as scope
  join activity on activity.project_id = scope.project_id
  order by activity.n desc, scope.project_id
  limit greatest(max_projects, 0);
$$;

alter table public.todo_items drop column handled_at;

revoke all on function
  public.list_todo_items(uuid),
  public.set_todo_stage(uuid, uuid[], text),
  public.delete_todo_items(uuid, uuid[])
from public, anon, authenticated;

grant execute on function
  public.list_todo_items(uuid),
  public.set_todo_stage(uuid, uuid[], text),
  public.delete_todo_items(uuid, uuid[])
to authenticated;
