-- orion-allow-destructive
-- Widen the tile-name lists from 8 to 11 names (adds motion, shape, voice).
-- Mirrors TASTE_TILES in packages/contracts/src/taste.ts.
-- Dropping the old tile check before adding the wider one is intentional.

do $$
declare
  existing text;
begin
  select conname into existing from pg_constraint
  where conrelid = 'public.taste_suggestions'::regclass
    and contype = 'c'
    and pg_get_constraintdef(oid) like '%designLanguage%';
  if existing is not null then
    execute format('alter table public.taste_suggestions drop constraint %I', existing);
  end if;
end $$;

alter table public.taste_suggestions
  add constraint taste_suggestions_tile_check
  check (tile in ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid','motion','shape','voice'));

create or replace function public.save_taste_board(
  target_workspace_id uuid, new_board jsonb, expected_version integer, lock_tile text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  next_version integer;
begin
  if uid is null or not public.is_workspace_member(target_workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if new_board is null or jsonb_typeof(new_board) <> 'object' then
    raise exception 'invalid board' using errcode = '22023';
  end if;
  if lock_tile is not null and lock_tile not in
    ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid','motion','shape','voice') then
    raise exception 'invalid tile' using errcode = '22023';
  end if;

  update public.taste_profiles
  set board = new_board,
      version = version + 1,
      locks = case when lock_tile is null then locks
                   else jsonb_set(locks, array[lock_tile], to_jsonb(public.taste_sorted_count(target_workspace_id, uid))) end,
      updated_at = now()
  where workspace_id = target_workspace_id and user_id = uid
    and version = expected_version and board is not null
  returning version into next_version;
  return next_version;
end;
$$;

create or replace function public.capture_save_taste_board(
  actor_user_id uuid, target_workspace_id uuid, new_board jsonb, expected_version integer, lock_tile text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  next_version integer;
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if new_board is null or jsonb_typeof(new_board) <> 'object' then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  if lock_tile is not null and lock_tile not in
    ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid','motion','shape','voice') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.taste_profiles
  set board = new_board,
      version = version + 1,
      locks = case when lock_tile is null then locks
                   else jsonb_set(locks, array[lock_tile], to_jsonb(public.taste_sorted_count(target_workspace_id, actor_user_id))) end,
      updated_at = now()
  where workspace_id = target_workspace_id and user_id = actor_user_id
    and version = expected_version and board is not null
  returning version into next_version;
  return next_version;
end;
$$;

create or replace function public.capture_clear_taste_lock(actor_user_id uuid, target_workspace_id uuid, lock_tile text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if lock_tile not in ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid','motion','shape','voice') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  update public.taste_profiles set locks = locks - lock_tile, updated_at = now()
    where workspace_id = target_workspace_id and user_id = actor_user_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;
