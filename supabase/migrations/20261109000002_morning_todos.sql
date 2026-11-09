-- Orion morning to-dos (docs/superpowers/specs/2026-11-09-orion-morning-todos-design.md).
-- Tables are closed to anon/authenticated; every read and write goes through the
-- functions below (same pattern as room_views).

create table public.todo_items (
  id uuid primary key,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  project_id uuid,
  text text not null check (char_length(btrim(text)) between 1 and 500),
  author text not null check (author in ('owner', 'orion')),
  position double precision not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  handled_at timestamptz,
  deleted_at timestamptz,
  foreign key (project_id, workspace_id)
    references public.projects(id, workspace_id) on delete set null (project_id)
);
create index todo_items_open on public.todo_items (workspace_id, position)
  where handled_at is null and deleted_at is null;
create index todo_items_project on public.todo_items (project_id);

create table public.project_briefs (
  project_id uuid primary key references public.projects(id) on delete cascade,
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  summary text not null default '' check (char_length(summary) <= 4000),
  last_read_at timestamptz not null,
  updated_at timestamptz not null default now()
);

create table public.morning_runs (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  local_date date not null,
  status text not null check (status in ('running', 'done', 'failed')),
  started_at timestamptz not null default now(),
  finished_at timestamptz,
  projects_read integer not null default 0,
  items_added integer not null default 0,
  primary key (workspace_id, local_date)
);

alter table public.ai_user_preferences
  add column time_zone text check (time_zone is null or char_length(time_zone) between 1 and 64);

alter table public.todo_items enable row level security;
alter table public.project_briefs enable row level security;
alter table public.morning_runs enable row level security;
revoke all on table public.todo_items, public.project_briefs, public.morning_runs
  from anon, authenticated;

-- ---------- Owner functions ----------

create function public.list_todo_items(target_workspace_id uuid)
returns table (id uuid, project_id uuid, text text, "position" double precision, created_at timestamptz)
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
    select item.id, item.project_id, item.text, item.position, item.created_at
    from public.todo_items as item
    where item.workspace_id = target_workspace_id
      and item.handled_at is null
      and item.deleted_at is null
    order by item.position, item.created_at;
end;
$$;

create function public.save_todo_item(
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
      and item.handled_at is null
      and item.deleted_at is null;
end;
$$;

create function public.remove_todo_items(
  target_workspace_id uuid,
  item_ids uuid[],
  removal text
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
  if removal not in ('deleted', 'handled') then
    raise exception 'Unknown removal.' using errcode = '22023';
  end if;
  update public.todo_items
  set deleted_at = case when removal = 'deleted' then now() else deleted_at end,
      handled_at = case when removal = 'handled' then now() else handled_at end,
      updated_at = now()
  where workspace_id = target_workspace_id
    and id = any(item_ids)
    and handled_at is null
    and deleted_at is null;
end;
$$;

create function public.set_my_time_zone(zone text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Not signed in.' using errcode = '42501';
  end if;
  if not exists (select 1 from pg_catalog.pg_timezone_names where name = zone) then
    raise exception 'Unknown time zone.' using errcode = '22023';
  end if;
  insert into public.ai_user_preferences (user_id, time_zone)
  values (auth.uid(), zone)
  on conflict (user_id) do update
    set time_zone = excluded.time_zone, updated_at = now();
end;
$$;

-- ---------- Service functions (the morning job) ----------

create function public.list_morning_workspaces()
returns table (workspace_id uuid, owner_user_id uuid, time_zone text)
language sql
stable
security definer
set search_path = ''
as $$
  select workspace.id, owner.user_id, preference.time_zone
  from public.workspaces as workspace
  join lateral (
    select membership.user_id
    from public.memberships as membership
    where membership.workspace_id = workspace.id
    order by (membership.role = 'admin') desc, membership.created_at
    limit 1
  ) as owner on true
  left join public.ai_user_preferences as preference on preference.user_id = owner.user_id;
$$;

create function public.claim_morning_run(target_workspace_id uuid, target_local_date date)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  claimed boolean;
begin
  insert into public.morning_runs as run (workspace_id, local_date, status, started_at)
  values (target_workspace_id, target_local_date, 'running', now())
  on conflict (workspace_id, local_date) do update
    set status = 'running', started_at = now(), finished_at = null
    where run.status = 'failed'
       or (run.status = 'running' and run.started_at < now() - interval '30 minutes')
  returning true into claimed;
  return coalesce(claimed, false);
end;
$$;

create function public.finish_morning_run(
  target_workspace_id uuid,
  target_local_date date,
  run_status text,
  read_count integer,
  added_count integer
)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.morning_runs
  set status = run_status, finished_at = now(),
      projects_read = read_count, items_added = added_count
  where workspace_id = target_workspace_id and local_date = target_local_date;
$$;

create function public.morning_todo_facts(
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
          and item.handled_at is null and item.deleted_at is null), '[]'::jsonb),
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

create function public.save_morning_todos(
  target_workspace_id uuid,
  target_project_id uuid,
  new_summary text,
  todo_texts text[],
  read_until timestamptz
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  start_position double precision;
  inserted integer;
begin
  if not exists (
    select 1 from public.projects
    where id = target_project_id and workspace_id = target_workspace_id
  ) then
    raise exception 'Project not found.' using errcode = 'P0002';
  end if;

  select coalesce(max(item.position), 0) into start_position
  from public.todo_items as item
  where item.workspace_id = target_workspace_id;

  insert into public.todo_items (id, workspace_id, project_id, text, author, position)
  select gen_random_uuid(), target_workspace_id, target_project_id,
         btrim(entry.value), 'orion', start_position + entry.ordinality
  from unnest(todo_texts) with ordinality as entry(value, ordinality)
  where char_length(btrim(entry.value)) between 1 and 500;
  get diagnostics inserted = row_count;

  insert into public.project_briefs (project_id, workspace_id, summary, last_read_at, updated_at)
  values (target_project_id, target_workspace_id, left(coalesce(new_summary, ''), 4000), read_until, now())
  on conflict (project_id) do update
    set summary = excluded.summary, last_read_at = excluded.last_read_at, updated_at = now();

  return inserted;
end;
$$;

-- ---------- Grants ----------

revoke all on function
  public.list_todo_items(uuid),
  public.save_todo_item(uuid, uuid, text, uuid, double precision),
  public.remove_todo_items(uuid, uuid[], text),
  public.set_my_time_zone(text),
  public.list_morning_workspaces(),
  public.claim_morning_run(uuid, date),
  public.finish_morning_run(uuid, date, text, integer, integer),
  public.morning_todo_facts(uuid, uuid, integer),
  public.save_morning_todos(uuid, uuid, text, text[], timestamptz)
from public, anon, authenticated;

grant execute on function
  public.list_todo_items(uuid),
  public.save_todo_item(uuid, uuid, text, uuid, double precision),
  public.remove_todo_items(uuid, uuid[], text),
  public.set_my_time_zone(text)
to authenticated;

grant execute on function
  public.list_morning_workspaces(),
  public.claim_morning_run(uuid, date),
  public.finish_morning_run(uuid, date, text, integer, integer),
  public.morning_todo_facts(uuid, uuid, integer),
  public.save_morning_todos(uuid, uuid, text, text[], timestamptz)
to service_role;
