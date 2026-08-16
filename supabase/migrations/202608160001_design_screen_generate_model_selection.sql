-- Thread model selection through design screen generation, mirroring
-- 202608090005_prd_model_selection.sql's pattern: the three-argument
-- (screen, provider, instruction) function remains the compatibility path
-- for older clients; this four-argument overload updates the task's model
-- in the same transaction before the queued row can become visible to a
-- connector. No default on target_model -- giving it one would let a
-- three-argument call resolve ambiguously against the existing overload
-- (see 202608130011_design_screen_generate_instruction.sql's own note on
-- why its arguments are all required for the same reason).
create function public.create_design_screen_generate_task(
  target_screen_id uuid,
  target_provider public.ai_provider,
  target_instruction text,
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
    raise exception 'invalid_design_screen_generate_request' using errcode = 'P0001';
  end if;

  result := public.create_design_screen_generate_task(
    target_screen_id,
    target_provider,
    target_instruction
  );
  task_id := (result ->> 'id')::uuid;

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

revoke all on function public.create_design_screen_generate_task(
  uuid, public.ai_provider, text, text
) from public, anon, authenticated, service_role;
grant execute on function public.create_design_screen_generate_task(
  uuid, public.ai_provider, text, text
) to authenticated;
