-- Manual action-link overrides: a user drawing an arrow from one screen's
-- nav action to another screen's frame. This table stores those overrides;
-- later work reads it when resolving where a screen's nav buttons should
-- navigate. Keyed on (screen_id, action_id) so an action always resolves to
-- at most one manual target.

create table public.design_screen_action_links (
  screen_id uuid not null references public.design_screens(id) on delete cascade,
  action_id text not null
    check (action_id ~ '^[a-z][a-z0-9_-]{0,63}$'),
  target_screen_id uuid not null references public.design_screens(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (screen_id, action_id),
  constraint design_screen_action_links_no_self_link
    check (target_screen_id <> screen_id)
);

alter table public.design_screen_action_links enable row level security;
revoke all on table public.design_screen_action_links from anon, authenticated, service_role;
grant select on table public.design_screen_action_links to authenticated, service_role;
create policy "Participants can view screen action links"
on public.design_screen_action_links for select to authenticated
using (
  exists (
    select 1 from public.design_screens as screen
    where screen.id = design_screen_action_links.screen_id
      and public.is_room_participant(screen.room_id)
  )
);

-- Upsert a manual link override. Returns whether a row was written.
create function public.set_design_screen_action_link(
  target_screen_id uuid,
  target_action_id text,
  target_link_screen_id uuid
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.design_screens;
  target public.design_screens;
begin
  select * into source from public.design_screens
  where id = target_screen_id and deleted_at is null;
  if source.id is null or not public.can_edit_room(source.room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  if target_action_id is null or target_action_id !~ '^[a-z][a-z0-9_-]{0,63}$' then
    raise exception 'invalid_action_id' using errcode = 'P0001';
  end if;

  select * into target from public.design_screens
  where id = target_link_screen_id and deleted_at is null;
  if target.id is null then
    raise exception 'design_screen_not_found' using errcode = 'P0001';
  end if;

  if target.room_id <> source.room_id then
    raise exception 'design_screen_cross_room' using errcode = 'P0001';
  end if;

  if target_link_screen_id = target_screen_id then
    raise exception 'design_screen_action_link_self' using errcode = 'P0001';
  end if;

  insert into public.design_screen_action_links (
    screen_id, action_id, target_screen_id, updated_at
  ) values (
    target_screen_id, target_action_id, target_link_screen_id, now()
  )
  on conflict (screen_id, action_id) do update
    set target_screen_id = excluded.target_screen_id,
        updated_at = now();

  return found;
end;
$$;

revoke all on function public.set_design_screen_action_link(uuid, text, uuid)
  from public, anon, service_role;
grant execute on function public.set_design_screen_action_link(uuid, text, uuid)
  to authenticated;

-- Clear a manual link override. Returns whether a row was found and deleted.
create function public.clear_design_screen_action_link(
  target_screen_id uuid,
  target_action_id text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  source public.design_screens;
  -- target_screen_id (the source screen) shares its name with this table's
  -- own target_screen_id column, so copy it to a distinctly-named variable
  -- before using it in a query that scopes that column, to keep the
  -- comparison unambiguous.
  source_screen_id uuid := target_screen_id;
begin
  select * into source from public.design_screens
  where id = source_screen_id and deleted_at is null;
  if source.id is null or not public.can_edit_room(source.room_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  delete from public.design_screen_action_links
  where screen_id = source_screen_id and action_id = target_action_id;

  return found;
end;
$$;

revoke all on function public.clear_design_screen_action_link(uuid, text)
  from public, anon, service_role;
grant execute on function public.clear_design_screen_action_link(uuid, text)
  to authenticated;
