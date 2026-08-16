-- Enrich hydration so the connector receives the frozen source document as
-- context.designSystemSource for design_profile_distill tasks. Preserve the
-- current implementation (design + user-flow-assist enrichment) unchanged.
alter function public.hydrate_authorized_room_context(uuid, uuid)
  rename to hydrate_authorized_room_context_pre_design_profile_distill;

revoke all on function public.hydrate_authorized_room_context_pre_design_profile_distill(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context_pre_design_profile_distill(uuid, uuid)
  to service_role;

create function public.hydrate_authorized_room_context(
  target_task_id uuid,
  target_attempt_id uuid
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  hydrated_result jsonb;
  hydrated_context jsonb;
  source_text text;
  source_name text;
  target_device_id uuid;
begin
  hydrated_result := public.hydrate_authorized_room_context_pre_design_profile_distill(
    target_task_id, target_attempt_id
  );

  if hydrated_result ->> 'status' <> 'ready'
    or hydrated_result #>> '{context,kind}' <> 'design_profile_distill'
  then
    return hydrated_result;
  end if;

  select distill.source_extracted_text, distill.source_file_name
  into source_text, source_name
  from public.design_profile_distills as distill
  where distill.task_id = target_task_id;

  if source_text is null then
    return hydrated_result;
  end if;

  hydrated_context := (hydrated_result -> 'context')
    || jsonb_build_object(
      'designSystemSource',
      jsonb_build_object(
        'text', source_text,
        'fileName', coalesce(source_name, 'design-system')
      )
    );

  if octet_length(hydrated_context::text) > 524288 then
    select task.device_id into target_device_id
    from public.ai_tasks as task where task.id = target_task_id;
    perform public.settle_ai_task(
      target_task_id, target_device_id, target_attempt_id,
      'fail', 'unknown', 'Hydrated AI task context exceeds 512 KiB.', null, false
    );
    return jsonb_build_object('status', 'rejected', 'reason', 'context_too_large');
  end if;

  return jsonb_set(hydrated_result, '{context}', hydrated_context);
end;
$$;

revoke all on function public.hydrate_authorized_room_context(uuid, uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.hydrate_authorized_room_context(uuid, uuid)
  to service_role;
