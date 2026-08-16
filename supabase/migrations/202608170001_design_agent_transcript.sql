-- Durable transcript for the Canvas Agents panel: each design-screen
-- generation becomes one chat turn (the user's raw prompt + the agent's
-- reply). ai_tasks.instruction can't back this -- the web layer appends
-- layout/context blocks to it before storing (it's the connector's prompt),
-- so it isn't the user's clean words. Store the raw prompt separately on the
-- generation record and read turns back joined with the screen's state.

alter table public.design_screen_generations
  add column if not exists user_prompt text;

-- Set the raw user prompt for a just-queued generation. Called by the web
-- layer right after create_design_screen_generate_task with the untrimmed
-- pre-block instruction. Capped like ai_tasks.instruction; a null/blank
-- prompt clears to null (the turn then shows the agent reply only).
create function public.set_design_generation_user_prompt(
  target_task_id uuid,
  target_prompt text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room uuid;
begin
  select generation.room_id into target_room
  from public.design_screen_generations as generation
  where generation.task_id = target_task_id;

  if target_room is null or not public.can_edit_room(target_room) then
    raise exception 'invalid_design_generation_prompt_request' using errcode = 'P0001';
  end if;

  update public.design_screen_generations
  set user_prompt = left(nullif(btrim(target_prompt), ''), 4000)
  where task_id = target_task_id;
end;
$$;

revoke all on function public.set_design_generation_user_prompt(uuid, text)
  from public, anon, authenticated, service_role;
grant execute on function public.set_design_generation_user_prompt(uuid, text)
  to authenticated;

-- One row per design-screen generation, newest last -- the Agents panel's
-- durable transcript. Each row carries the user's raw prompt, who asked, the
-- task's live status, and the target screen's name/state so the panel can
-- render "You: <prompt>" then the agent's reply (generating / built / failed).
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
  created_at timestamptz
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
    task.created_at
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
