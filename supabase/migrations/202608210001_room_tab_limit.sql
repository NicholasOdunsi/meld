-- A Room may show its generated Overview plus five stored work tabs. The
-- advisory lock makes the count authoritative even when collaborators create
-- tabs concurrently, and assigning position under that same lock prevents
-- two inserts from choosing the same next position.
create function public.enforce_room_tab_limit()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_count integer;
  next_position integer;
begin
  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(new.room_id::text, 0)
  );

  select count(*), coalesce(max(tab.position) + 1, 0)
  into current_count, next_position
  from public.room_tabs as tab
  where tab.room_id = new.room_id;

  if current_count >= 5 then
    raise exception 'A Room can hold at most five work tabs.'
      using errcode = '23514', constraint = 'room_tabs_room_limit';
  end if;

  new.position := next_position;
  return new;
end;
$$;

revoke all on function public.enforce_room_tab_limit()
from public, anon, authenticated;

create trigger room_tab_limit
before insert on public.room_tabs
for each row
execute function public.enforce_room_tab_limit();
