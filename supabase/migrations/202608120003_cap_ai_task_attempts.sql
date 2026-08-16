-- A device can claim a running task, produce no events, and let its 90-second
-- lease expire. reap_expired_ai_task_leases treated every such no-event expiry
-- as a transient miss and returned the task to 'waiting_for_device', where the
-- dispatcher immediately handed it back to the same device. A device that never
-- makes progress -- a wedged or mismatched connector, a provider that dies
-- before emitting anything -- therefore looped forever: claim, expire, requeue,
-- reclaim, every ~90 seconds, with the task pinned to a non-terminal status so
-- the surface showed "Responding" indefinitely.
--
-- Bound the retries. A no-event expiry below the cap is still treated as a
-- transient miss and requeued, preserving resilience to a genuine reconnect
-- blip. Once a task has been claimed this many times and still produced
-- nothing, another retry will not help: fail it with 'execution_abandoned' so
-- the surface shows an error and the loop stops. Eventful expiries are
-- unchanged -- they already terminate at 'needs_review'.

create function public.ai_task_max_attempts()
returns integer
language sql
immutable
set search_path = ''
as $$
  select 3;
$$;

revoke all on function public.ai_task_max_attempts() from public;
revoke all on function public.ai_task_max_attempts()
  from anon, authenticated, service_role;

create or replace function public.reap_expired_ai_task_leases()
returns table (
  task_id uuid,
  attempt_id uuid,
  outcome public.ai_task_status
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  expired_attempt record;
  target_outcome public.ai_task_status;
  target_error_code public.task_error_code;
  target_error_message text;
begin
  for expired_attempt in
    select
      attempt.task_id as task_id_value,
      attempt.id as attempt_id_value,
      attempt.attempt_no as attempt_no_value,
      (
        select count(*)
        from public.ai_task_events as event
        where event.attempt_id = attempt.id
      ) as event_count
    from public.ai_tasks as task
    join public.ai_task_attempts as attempt on attempt.task_id = task.id
    where attempt.settled_at is null
      and attempt.lease_expires_at <= now()
      and task.status = 'running'
    order by attempt.lease_expires_at, attempt.id
    for update of task, attempt skip locked
  loop
    if expired_attempt.event_count > 0 then
      -- Output was recorded before the attempt stalled: a human should look.
      target_outcome := 'needs_review';
      target_error_code := 'execution_abandoned';
      target_error_message :=
        'AI task execution lease expired after events were recorded.';
    elsif expired_attempt.attempt_no_value >= public.ai_task_max_attempts() then
      -- This many claims have now produced nothing; another retry will not
      -- help. Fail the task so the surface stops waiting.
      target_outcome := 'failed';
      target_error_code := 'execution_abandoned';
      target_error_message :=
        'AI task abandoned after repeated attempts produced no output.';
    else
      -- A no-event expiry below the cap is a transient miss: requeue it.
      target_outcome := 'waiting_for_device';
      target_error_code := null;
      target_error_message := null;
    end if;

    perform public.transition_ai_task(
      expired_attempt.task_id_value,
      target_outcome,
      'running'
    );

    update public.ai_tasks
    set result_json = null,
        error_code = target_error_code,
        error_message = target_error_message,
        updated_at = now()
    where id = expired_attempt.task_id_value;

    task_id := expired_attempt.task_id_value;
    attempt_id := expired_attempt.attempt_id_value;
    outcome := target_outcome;
    return next;
  end loop;
end;
$$;

revoke all on function public.reap_expired_ai_task_leases() from public;
revoke all on function public.reap_expired_ai_task_leases()
  from anon, authenticated, service_role;
grant execute on function public.reap_expired_ai_task_leases()
  to service_role;
