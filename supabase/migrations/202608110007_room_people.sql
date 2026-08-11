create function public.list_room_people(
  target_room_id uuid,
  target_user_ids uuid[]
)
returns table (
  user_id uuid,
  email text
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not public.is_room_participant(target_room_id) then
    raise exception 'Room participation required' using errcode = 'P0001';
  end if;

  return query
  select
    requested_user.id,
    lower(btrim(requested_user.email))
  from auth.users as requested_user
  where requested_user.id = any(coalesce(target_user_ids, array[]::uuid[]))
    and (
      exists (
        select 1
        from public.room_participants as participant
        where participant.room_id = target_room_id
          and participant.user_id = requested_user.id
      )
      or exists (
        select 1
        from public.decisions as decision
        where decision.room_id = target_room_id
          and decision.created_by = requested_user.id
      )
    )
  order by lower(btrim(requested_user.email)), requested_user.id;
end;
$$;

revoke all on function public.list_room_people(uuid, uuid[]) from public;
grant execute on function public.list_room_people(uuid, uuid[])
  to authenticated;
