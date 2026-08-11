-- Thread model selection through the PRD section-assist queue. The original
-- five-argument function remains the compatibility path for older clients;
-- this overload updates the task in the same transaction before the queued
-- row can become visible to a connector.
create function public.create_prd_section_assist_task(
  target_room_id uuid,
  target_sections jsonb,
  target_instruction text,
  target_client_request_id uuid,
  target_provider public.ai_provider,
  target_model text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  result jsonb;
  task_id uuid;
  selected_model text;
begin
  if target_model is not null
    and (
      char_length(btrim(target_model)) = 0
      or char_length(btrim(target_model)) > 100
    )
  then
    raise exception 'invalid_prd_section_assist_request' using errcode = 'P0001';
  end if;

  result := public.create_prd_section_assist_task(
    target_room_id,
    target_sections,
    target_instruction,
    target_client_request_id,
    target_provider
  );
  task_id := (result ->> 'taskId')::uuid;

  update public.ai_tasks
  set model = nullif(btrim(target_model), ''), updated_at = now()
  where id = task_id;

  select task.model
  into selected_model
  from public.ai_tasks as task
  where task.id = task_id;

  return result || jsonb_build_object('model', selected_model);
end;
$$;

revoke all on function public.create_prd_section_assist_task(
  uuid, jsonb, text, uuid, public.ai_provider, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_prd_section_assist_task(
  uuid, jsonb, text, uuid, public.ai_provider, text
) to authenticated;
