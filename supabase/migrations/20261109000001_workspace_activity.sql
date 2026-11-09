-- Orion Overview + working hats
-- (docs/superpowers/specs/2026-11-09-orion-overview-and-working-hats-design.md).
-- Classifies every Room the caller participates in as idle, working, or
-- needing them (asked / finished / stuck).

create table public.room_views (
  user_id uuid not null references auth.users(id) on delete cascade,
  room_id uuid not null references public.rooms(id) on delete cascade,
  last_viewed_at timestamptz,
  dismissed_at timestamptz,
  primary key (user_id, room_id)
);

alter table public.room_views enable row level security;
-- No policies on purpose: read and written only through the functions below.
revoke all on table public.room_views from anon, authenticated;

create function public.mark_room_viewed(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_room_participant(target_room_id) then
    raise exception 'Room not found.' using errcode = '42501';
  end if;
  insert into public.room_views (user_id, room_id, last_viewed_at)
  values (auth.uid(), target_room_id, now())
  on conflict (user_id, room_id)
    do update set last_viewed_at = excluded.last_viewed_at;
end;
$$;

create function public.dismiss_room_attention(target_room_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null or not public.is_room_participant(target_room_id) then
    raise exception 'Room not found.' using errcode = '42501';
  end if;
  insert into public.room_views (user_id, room_id, dismissed_at)
  values (auth.uid(), target_room_id, now())
  on conflict (user_id, room_id)
    do update set dismissed_at = excluded.dismissed_at;
end;
$$;

create function public.list_workspace_activity(target_workspace_id uuid)
returns table (
  room_id uuid,
  project_id uuid,
  room_name text,
  state text,
  reason text,
  task_kind public.ai_task_kind,
  task_status public.ai_task_status,
  provider public.ai_provider,
  proposal_kind text,
  proposal_message_id uuid,
  occurred_at timestamptz,
  last_activity_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
#variable_conflict use_column
begin
  return query
  with visible_room as (
    select room.id, room.project_id, room.name
    from public.rooms as room
    where room.workspace_id = target_workspace_id
      and public.is_room_participant(room.id)
  ),
  room_view as (
    select view.room_id, view.last_viewed_at, view.dismissed_at
    from public.room_views as view
    where view.user_id = auth.uid()
  ),
  active_room as (
    select distinct task.room_id
    from public.ai_tasks as task
    join visible_room on visible_room.id = task.room_id
    where task.status in ('queued', 'waiting_for_device', 'ready_to_run', 'running')
  ),
  latest_task as (
    select distinct on (task.room_id)
      task.room_id, task.kind, task.status, task.provider, task.updated_at
    from public.ai_tasks as task
    join visible_room on visible_room.id = task.room_id
    order by task.room_id, task.updated_at desc, task.id desc
  ),
  latest_proposal as (
    select distinct on (message.room_id)
      message.room_id, message.id, message.ai_task_id,
      message.proposed_action ->> 'kind' as kind, message.created_at
    from public.messages as message
    join visible_room on visible_room.id = message.room_id
    where message.proposed_action is not null
    order by message.room_id, message.created_at desc, message.id desc
  ),
  -- Mirrors isProposalOffered in
  -- apps/web/src/features/rooms/components/conversation.tsx. Change both
  -- together. "PRD task settled" is implied: a running task makes the
  -- room 'working' before this is consulted.
  open_proposal as (
    select proposal.*
    from latest_proposal as proposal
    where not exists (
        select 1 from public.message_proposal_responses as response
        where response.message_id = proposal.id
          and response.user_id = auth.uid()
      )
      and case proposal.kind
        when 'prd_generate' then not exists (
          select 1 from public.prds as prd where prd.room_id = proposal.room_id)
        when 'prd_revise' then proposal.ai_task_id is not null and exists (
          select 1 from public.prds as prd where prd.room_id = proposal.room_id)
        else true
      end
  ),
  latest_message as (
    select message.room_id, max(message.created_at) as at
    from public.messages as message
    join visible_room on visible_room.id = message.room_id
    group by message.room_id
  ),
  classified as (
    select
      visible_room.id as room_id,
      visible_room.project_id,
      visible_room.name as room_name,
      active_room.room_id is not null as is_working,
      coalesce(
        latest_task.status in ('failed', 'needs_reauthentication', 'usage_limit_reached', 'needs_review')
          and latest_task.updated_at > coalesce(room_view.dismissed_at, '-infinity'::timestamptz),
        false) as is_stuck,
      open_proposal.id is not null as is_asked,
      coalesce(
        latest_task.status = 'completed'
          and latest_task.updated_at > coalesce(room_view.last_viewed_at, '-infinity'::timestamptz),
        false) as is_finished,
      latest_task.kind as task_kind,
      latest_task.status as task_status,
      latest_task.provider,
      latest_task.updated_at as task_at,
      open_proposal.kind as proposal_kind,
      open_proposal.id as proposal_message_id,
      open_proposal.created_at as proposal_at,
      greatest(latest_task.updated_at, latest_message.at) as last_activity_at
    from visible_room
    left join active_room on active_room.room_id = visible_room.id
    left join latest_task on latest_task.room_id = visible_room.id
    left join room_view on room_view.room_id = visible_room.id
    left join open_proposal on open_proposal.room_id = visible_room.id
    left join latest_message on latest_message.room_id = visible_room.id
  )
  select
    c.room_id,
    c.project_id,
    c.room_name,
    case
      when c.is_working then 'working'
      when c.is_stuck or c.is_asked or c.is_finished then 'needs_you'
      else 'idle'
    end,
    case
      when c.is_working then null
      when c.is_stuck then 'stuck'
      when c.is_asked then 'asked'
      when c.is_finished then 'finished'
    end,
    c.task_kind,
    c.task_status,
    c.provider,
    case when not c.is_working and not c.is_stuck and c.is_asked then c.proposal_kind end,
    case when not c.is_working and not c.is_stuck and c.is_asked then c.proposal_message_id end,
    case
      when c.is_working then null
      when c.is_stuck then c.task_at
      when c.is_asked then c.proposal_at
      when c.is_finished then c.task_at
    end,
    c.last_activity_at
  from classified as c
  order by c.room_id;
end;
$$;

revoke all on function public.mark_room_viewed(uuid) from public;
revoke all on function public.dismiss_room_attention(uuid) from public;
revoke all on function public.list_workspace_activity(uuid) from public;
grant execute on function public.mark_room_viewed(uuid) to authenticated;
grant execute on function public.dismiss_room_attention(uuid) to authenticated;
grant execute on function public.list_workspace_activity(uuid) to authenticated;
