-- Give `prd_assist_requests.status = 'dismissed'` a writer.
--
-- 202608080005 defined the status but shipped no way to reach it, which left
-- the recovery surface unusable in practice: the PRD tab lists the reader's
-- own pending/ready/failed requests on mount so a refresh cannot lose one, and
-- with no way to close a settled request that list would show every answer the
-- reader has ever received, on every page load, forever.
--
-- Dismissal is deliberately narrow:
--   * only the request's own creator may dismiss it -- it is that reader's
--     unread marker, not a room-wide one, and `listRoomPrdAssistRequests`
--     already scopes recovery to the caller's own rows;
--   * only a settled request may be dismissed. A pending request is still
--     running and will settle on its own; closing the popover over one must
--     not throw away the result that is about to arrive;
--   * dismissal touches nothing but `status`. A dismissed request keeps its
--     answer, its proposal, and its conversation messages, so the record of
--     what was asked and what came back survives the reader closing the card.
create function public.dismiss_prd_assist_request(target_request_id uuid)
returns public.prd_assist_requests
language plpgsql
security definer
set search_path = ''
as $$
declare
  caller_id uuid := auth.uid();
  request public.prd_assist_requests%rowtype;
begin
  select r.* into request
  from public.prd_assist_requests as r
  where r.id = target_request_id
  for update;

  if request.id is null
    or caller_id is null
    or request.created_by <> caller_id
    or not public.is_room_participant(request.room_id)
    or request.status not in ('ready', 'failed')
  then
    raise exception 'prd_assist_request_not_dismissable' using errcode = 'P0001';
  end if;

  update public.prd_assist_requests
  set status = 'dismissed', updated_at = now()
  where id = request.id
  returning * into request;

  return request;
end;
$$;

revoke all on function public.dismiss_prd_assist_request(uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.dismiss_prd_assist_request(uuid) to authenticated;
