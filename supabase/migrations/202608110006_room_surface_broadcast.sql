create function public.broadcast_room_surface_change()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_room_id uuid;
begin
  target_room_id := case when tg_op = 'DELETE' then old.room_id else new.room_id end;

  perform realtime.broadcast_changes(
    'room:' || target_room_id::text,
    'room-surfaces-changed',
    tg_op,
    tg_table_name,
    tg_table_schema,
    new,
    old
  );

  return case when tg_op = 'DELETE' then old else new end;
end;
$$;

revoke all on function public.broadcast_room_surface_change() from public;

create trigger user_flows_broadcast_room_surface_change
after insert or delete on public.user_flows
for each row execute function public.broadcast_room_surface_change();

create trigger decisions_broadcast_room_surface_change
after insert or delete on public.decisions
for each row execute function public.broadcast_room_surface_change();
