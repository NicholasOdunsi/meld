-- PostgreSQL cannot change a RETURNS TABLE shape with create or replace, so
-- recreate the participant-scoped projection with the task's safe agent role.
drop function public.list_room_ai_task_statuses(uuid);

create function public.list_room_ai_task_statuses(
  target_room_id uuid
)
returns table (
  task_id uuid,
  source_message_id uuid,
  initiating_user_id uuid,
  provider public.ai_provider,
  kind public.ai_task_kind,
  agent_kind public.ai_agent_kind,
  status public.ai_task_status,
  created_at timestamptz,
  updated_at timestamptz
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
    task.source_message_id,
    task.initiating_user_id,
    task.provider,
    task.kind,
    task.agent_kind,
    task.status,
    task.created_at,
    task.updated_at
  from public.ai_tasks as task
  where task.room_id = target_room_id
  order by task.created_at, task.id;
end;
$$;

revoke all on function public.list_room_ai_task_statuses(uuid) from public;
revoke all on function public.list_room_ai_task_statuses(uuid)
  from anon, authenticated, service_role;
grant execute on function public.list_room_ai_task_statuses(uuid)
  to authenticated;
