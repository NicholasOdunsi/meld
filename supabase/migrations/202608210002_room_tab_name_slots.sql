-- The five fallback tab names map to positions 0-4. Normalize older Rooms
-- whose positions kept increasing after closes, then reuse the first free
-- position so those five names remain unique without numeric suffixes.
with ranked_tabs as (
  select
    tab.id,
    row_number() over (
      partition by tab.room_id
      order by tab.position, tab.id
    ) - 1 as normalized_position
  from public.room_tabs as tab
)
update public.room_tabs as tab
set position = ranked.normalized_position
from ranked_tabs as ranked
where tab.id = ranked.id
  and tab.position <> ranked.normalized_position;

create or replace function public.enforce_room_tab_limit()
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

  select count(*)
  into current_count
  from public.room_tabs as tab
  where tab.room_id = new.room_id;

  if current_count >= 5 then
    raise exception 'A Room can hold at most five work tabs.'
      using errcode = '23514', constraint = 'room_tabs_room_limit';
  end if;

  select slot.position
  into next_position
  from pg_catalog.generate_series(0, 4) as slot(position)
  where not exists (
    select 1
    from public.room_tabs as tab
    where tab.room_id = new.room_id
      and tab.position = slot.position
  )
  order by slot.position
  limit 1;

  new.position := next_position;
  return new;
end;
$$;
