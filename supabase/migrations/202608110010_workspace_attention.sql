-- Attention in another workspace has to be visible without being readable.
-- The rail needs to know that something is waiting; it must not learn which
-- Room, which message, or which client it concerns. So the summary returns a
-- workspace id and a boolean and nothing else, and the boolean is computed
-- inside the database from Rooms the caller actually participates in --
-- administering a workspace grants no attention signal from a Room the caller
-- was never added to.
create function public.list_workspace_attention()
returns table (
  workspace_id uuid,
  has_attention boolean
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  return query
  select membership.workspace_id,
    exists (
      select 1
      from public.mentions as mention
      join public.rooms as room on room.id = mention.room_id
      where room.workspace_id = membership.workspace_id
        and mention.mentioned_user_id = auth.uid()
        and mention.acknowledged_at is null
        and public.is_room_participant(room.id)
    ) as has_attention
  from public.memberships as membership
  where membership.user_id = auth.uid();
end;
$$;

revoke all on function public.list_workspace_attention() from public;
grant execute on function public.list_workspace_attention() to authenticated;
