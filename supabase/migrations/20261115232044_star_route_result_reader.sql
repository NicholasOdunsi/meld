create function public.read_star_route_result(target_task_id uuid)
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
      'confidence', task.result_json -> 'payload' -> 'confidence'
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

revoke all on function public.read_star_route_result(uuid) from public, anon, service_role;
grant execute on function public.read_star_route_result(uuid) to authenticated;
