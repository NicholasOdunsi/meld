-- Build mode part 1 (spec: docs/superpowers/specs/2026-11-23-build-mode-engine-design.md).
-- Statuses and link kinds mirror packages/contracts/src/build.ts -- change both together.
alter type public.ai_task_kind add value if not exists 'code_link';
alter type public.ai_task_kind add value if not exists 'build_turn';
alter type public.ai_task_kind add value if not exists 'build_approval';

create table public.project_code_links (
  project_id uuid primary key references public.projects(id) on delete cascade,
  kind text not null check (kind in ('github','folder','new_github')),
  repo_url text check (repo_url is null or repo_url ~ '^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+$'),
  display_name text not null check (char_length(btrim(display_name)) between 1 and 200),
  device_id uuid not null references public.execution_devices(id) on delete cascade,
  engine_project_id text check (engine_project_id is null or char_length(engine_project_id) between 1 and 200),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  check (kind <> 'folder' or repo_url is null),
  check (kind <> 'github' or repo_url is not null)
);

create index project_code_links_device_idx on public.project_code_links (device_id);

create table public.build_stars (
  star_task_id uuid primary key references public.room_stars(task_id) on delete cascade,
  project_id uuid not null references public.projects(id) on delete cascade,
  engine_thread_id text check (engine_thread_id is null or char_length(engine_thread_id) between 1 and 200),
  branch text check (branch is null or char_length(branch) between 1 and 250),
  status text not null default 'working' check (status in ('working','needs_you','done','failed','cancelled')),
  last_step text check (last_step is null or char_length(last_step) between 1 and 200),
  changed_files jsonb not null default '[]'::jsonb
    check (case when jsonb_typeof(changed_files) = 'array' then jsonb_array_length(changed_files) <= 200 else false end),
  pending_approval jsonb check (pending_approval is null or jsonb_typeof(pending_approval) = 'object'),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index build_stars_project_idx on public.build_stars (project_id, updated_at desc);

alter table public.project_code_links enable row level security;
alter table public.build_stars enable row level security;
revoke all on table public.project_code_links, public.build_stars from public, anon, authenticated;
grant select on table public.project_code_links, public.build_stars to authenticated;
grant select, insert, update, delete on table public.project_code_links, public.build_stars to service_role;

create policy "Members read project code links" on public.project_code_links
for select to authenticated using (
  exists (select 1 from public.projects p where p.id = project_code_links.project_id and public.is_workspace_member(p.workspace_id))
);
create policy "Participants read build stars" on public.build_stars
for select to authenticated using (
  exists (select 1 from public.room_stars s where s.task_id = build_stars.star_task_id and public.is_room_participant(s.room_id))
);

create or replace function public.read_star_route_result(target_task_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $$
  select case
    when task.status = 'completed'
      and task.result_json ->> 'kind' = 'star_route'
      and task.result_json ->> 'partial' = 'false'
    then jsonb_build_object(
      'decision', task.result_json -> 'payload' -> 'decision',
      'starTaskId', task.result_json -> 'payload' -> 'starTaskId',
      'confidence', task.result_json -> 'payload' -> 'confidence',
      'intent', coalesce(task.result_json -> 'payload' ->> 'intent', 'answer')
    )
    else null
  end
  from public.ai_tasks as task
  where task.id = target_task_id
    and task.kind = 'star_route'
    and task.initiating_user_id = (select auth.uid())
    and public.is_room_participant(task.room_id)
  limit 1;
$$;
