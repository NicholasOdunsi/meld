-- A generation returns a batch: one task can build several screens at once.
-- Only the task's own originating screen gets a `design_screen_generations`
-- row, though, and this transcript was built from that table alone -- so a run
-- that produced four screens showed one, and the other three existed on the
-- canvas with nothing in the conversation to say they had been made.
--
-- Every version already records the task that produced it
-- (design_screen_versions.originating_task_id), including the batch siblings,
-- so the full set is recoverable without changing how generations are written.
--
-- `screens` is added alongside the existing single-screen columns rather than
-- replacing them: those still describe the originating screen, and leaving
-- them lets consumers move over without a flag day.
-- Adding a column to a RETURNS TABLE changes the function's row type, which
-- `create or replace` cannot do -- the old signature has to go first. The
-- grants are re-applied below because dropping takes them with it.
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
  screens jsonb
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
        -- Every live screen this task produced, the originating one included.
        -- Ordered by creation so the batch reads in the order it was built,
        -- and distinct because a screen has one row per version.
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
      -- A task whose versions are gone (or predate this column) still has its
      -- originating screen, so the turn is never left describing nothing.
      jsonb_build_array(
        jsonb_build_object(
          'id', screen.id,
          'name', screen.name,
          'state', screen.state,
          'currentVersionId', screen.current_version_id
        )
      )
    )
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
