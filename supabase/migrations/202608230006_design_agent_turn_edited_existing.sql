-- Whether a run edited screens that already existed, or built new ones.
--
-- The conversation shows a design request as bare words: the @Design Agent
-- mention is stripped before the instruction is sent, and nothing recorded
-- which screens the person had selected. So a request that edited five chosen
-- screens looked identical to one that invented a screen from nothing.
--
-- design_screen_generations.base_version_id already carries it: a generation
-- with a base version was applied to an existing screen, one without built a
-- first version. Surfaced here so the turn can show what the request was aimed
-- at without a second read.
drop function if exists public.list_design_agent_turns(uuid);

create function public.list_design_agent_turns(target_room_id uuid)
returns table (
  task_id uuid,
  screen_id uuid,
  screen_name text,
  user_prompt text,
  initiated_by uuid,
  task_status public.ai_task_status,
  screen_state public.design_screen_state,
  current_version_id uuid,
  created_at timestamptz,
  screens jsonb,
  edited_existing boolean
)
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.is_room_participant(target_room_id) then
    return;
  end if;

  return query
  select
    task.id,
    generation.screen_id,
    screen.name,
    generation.user_prompt,
    task.initiating_user_id,
    task.status,
    screen.state,
    screen.current_version_id,
    task.created_at,
    coalesce(
      (
        select jsonb_agg(
                 jsonb_build_object(
                   'id', batch.id,
                   'name', batch.name,
                   'state', batch.state,
                   'currentVersionId', batch.current_version_id
                 )
                 order by batch.created_at, batch.id
               )
        from (
          select distinct on (produced.id)
            produced.id, produced.name, produced.state,
            produced.current_version_id, produced.created_at
          from public.design_screen_versions as version
          join public.design_screens as produced
            on produced.id = version.screen_id
          where version.originating_task_id = task.id
            and produced.deleted_at is null
            and produced.room_id = target_room_id
          order by produced.id
        ) as batch
      ),
      jsonb_build_array(
        jsonb_build_object(
          'id', screen.id,
          'name', screen.name,
          'state', screen.state,
          'currentVersionId', screen.current_version_id
        )
      )
    ),
    generation.base_version_id is not null
  from public.design_screen_generations as generation
  join public.ai_tasks as task on task.id = generation.task_id
  join public.design_screens as screen on screen.id = generation.screen_id
  where generation.room_id = target_room_id
    and screen.deleted_at is null
  order by task.created_at, task.id;
end;
$$;

revoke all on function public.list_design_agent_turns(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.list_design_agent_turns(uuid)
  to authenticated;
