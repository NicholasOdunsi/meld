-- Taste Profile (spec: docs/superpowers/specs/2026-11-07-taste-profile-design.md).
-- Tile keys and signal reasons mirror packages/contracts/src/taste.ts -- change both together.
-- Board contents are validated in TypeScript (zod) before every write; SQL only
-- checks shape, ownership and version.

create table public.taste_profiles (
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  board jsonb check (board is null or jsonb_typeof(board) = 'object'),
  locks jsonb not null default '{}'::jsonb check (jsonb_typeof(locks) = 'object'),
  version integer not null default 0,
  last_refresh_at timestamptz,
  sorted_count_at_refresh integer not null default 0,
  refresh_claimed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (workspace_id, user_id)
);

create table public.taste_suggestions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  refresh_id uuid not null,
  tile text not null check (tile in ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid')),
  op text not null check (op in ('add','remove','set')),
  value jsonb not null,
  value_key text not null check (char_length(value_key) between 1 and 300),
  reason text not null check (char_length(reason) between 1 and 140),
  evidence_item_ids uuid[] not null default '{}' check (cardinality(evidence_item_ids) <= 3),
  status text not null default 'pending' check (status in ('pending','kept','rejected','superseded')),
  board_version integer not null,
  created_at timestamptz not null default now(),
  decided_at timestamptz
);
create index taste_suggestions_pending on public.taste_suggestions (workspace_id, user_id) where status = 'pending';
create index taste_suggestions_rejected on public.taste_suggestions (workspace_id, user_id, value_key) where status = 'rejected';

create table public.taste_signals (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  screen_id uuid not null references public.design_screens(id) on delete cascade,
  reason text not null check (reason in ('too_plain','too_busy','wrong_colours','wrong_layout','not_my_style')),
  created_at timestamptz not null default now()
);
create index taste_signals_owner on public.taste_signals (workspace_id, user_id, created_at);

alter table public.taste_profiles enable row level security;
alter table public.taste_suggestions enable row level security;
alter table public.taste_signals enable row level security;
revoke all on table public.taste_profiles, public.taste_suggestions, public.taste_signals from anon, authenticated;
grant select on table public.taste_profiles, public.taste_suggestions, public.taste_signals to authenticated, service_role;

create policy "Owners read their taste profile" on public.taste_profiles
for select to authenticated using (user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy "Owners read their taste suggestions" on public.taste_suggestions
for select to authenticated using (user_id = auth.uid() and public.is_workspace_member(workspace_id));
create policy "Owners read their taste signals" on public.taste_signals
for select to authenticated using (user_id = auth.uid() and public.is_workspace_member(workspace_id));

-- Internal: the owner's sorted, ready library size.
create function public.taste_sorted_count(target_workspace_id uuid, target_user_id uuid)
returns integer
language sql
stable
security definer
set search_path = ''
as $$
  select count(*)::int
  from public.inspiration_labels as label
  join public.inspiration_items as item on item.id = label.item_id
  where label.workspace_id = target_workspace_id
    and label.status = 'sorted'
    and item.status = 'ready'
    and item.created_by = target_user_id;
$$;

create function public.claim_taste_refresh(target_workspace_id uuid, target_user_id uuid)
returns table (is_first boolean, sorted_count integer, board jsonb, locks jsonb, version integer, last_refresh_at timestamptz)
language plpgsql
security definer
set search_path = ''
as $$
#variable_conflict use_column
declare
  profile public.taste_profiles;
  sorted integer := public.taste_sorted_count(target_workspace_id, target_user_id);
  redo_ready boolean := false;
begin
  if sorted < 8 then return; end if;

  insert into public.taste_profiles (workspace_id, user_id)
  values (target_workspace_id, target_user_id)
  on conflict (workspace_id, user_id) do nothing;

  select * into profile from public.taste_profiles as p
  where p.workspace_id = target_workspace_id and p.user_id = target_user_id
  for update;

  if profile.refresh_claimed_at is not null and profile.refresh_claimed_at > now() - interval '5 minutes' then
    return;
  end if;

  if profile.board is not null then
    if profile.last_refresh_at is not null and profile.last_refresh_at > now() - interval '24 hours' then
      return;
    end if;
    select exists (
      select 1 from public.taste_signals as s
      where s.workspace_id = target_workspace_id and s.user_id = target_user_id
        and s.created_at > coalesce(profile.last_refresh_at, '-infinity'::timestamptz)
      group by s.reason having count(*) >= 2
    ) into redo_ready;
    if sorted - profile.sorted_count_at_refresh < 5 and not redo_ready then
      return;
    end if;
  end if;

  update public.taste_profiles as p
  set refresh_claimed_at = now(), updated_at = now()
  where p.workspace_id = target_workspace_id and p.user_id = target_user_id;

  return query select profile.board is null, sorted, profile.board, profile.locks, profile.version, profile.last_refresh_at;
end;
$$;

create function public.finish_taste_refresh(
  target_workspace_id uuid, target_user_id uuid, first_board jsonb, new_suggestions jsonb, sorted_count integer
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile public.taste_profiles;
  refresh uuid := gen_random_uuid();
  inserted integer := 0;
begin
  select * into profile from public.taste_profiles
  where workspace_id = target_workspace_id and user_id = target_user_id
  for update;
  if not found then return 0; end if;

  if first_board is not null then
    if jsonb_typeof(first_board) <> 'object' then
      raise exception 'invalid board' using errcode = '22023';
    end if;
    if profile.board is null then
      update public.taste_profiles
      set board = first_board, version = profile.version + 1
      where workspace_id = target_workspace_id and user_id = target_user_id;
    end if;
  else
    update public.taste_suggestions
    set status = 'superseded', decided_at = now()
    where workspace_id = target_workspace_id and user_id = target_user_id and status = 'pending';

    insert into public.taste_suggestions
      (workspace_id, user_id, refresh_id, tile, op, value, value_key, reason, evidence_item_ids, board_version)
    select target_workspace_id, target_user_id, refresh,
           s ->> 'tile', s ->> 'op', s -> 'value', s ->> 'valueKey', s ->> 'reason',
           array(select jsonb_array_elements_text(coalesce(s -> 'evidenceItemIds', '[]'::jsonb)))::uuid[],
           profile.version
    from jsonb_array_elements(coalesce(new_suggestions, '[]'::jsonb)) as s;
    get diagnostics inserted = row_count;
  end if;

  update public.taste_profiles
  set last_refresh_at = now(), sorted_count_at_refresh = sorted_count,
      refresh_claimed_at = null, updated_at = now()
  where workspace_id = target_workspace_id and user_id = target_user_id;
  return inserted;
end;
$$;

create function public.release_taste_refresh(target_workspace_id uuid, target_user_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  update public.taste_profiles
  set refresh_claimed_at = null, updated_at = now()
  where workspace_id = target_workspace_id and user_id = target_user_id;
$$;

create function public.save_taste_board(
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
    ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid') then
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

create function public.decide_taste_suggestion(
  target_suggestion_id uuid, decision text, new_board jsonb, expected_version integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  suggestion public.taste_suggestions;
  current_version integer;
begin
  if uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if decision not in ('kept', 'rejected') then
    raise exception 'invalid decision' using errcode = '22023';
  end if;

  select * into suggestion from public.taste_suggestions
  where id = target_suggestion_id and user_id = uid
  for update;
  if not found or not public.is_workspace_member(suggestion.workspace_id) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if suggestion.status <> 'pending' then
    return suggestion.status;
  end if;

  select version into current_version from public.taste_profiles
  where workspace_id = suggestion.workspace_id and user_id = uid
  for update;

  if new_board is null or jsonb_typeof(new_board) <> 'object' or current_version is distinct from expected_version then
    update public.taste_suggestions set status = 'superseded', decided_at = now() where id = target_suggestion_id;
    return 'superseded';
  end if;

  update public.taste_profiles
  set board = new_board, version = version + 1, updated_at = now()
  where workspace_id = suggestion.workspace_id and user_id = uid;
  update public.taste_suggestions set status = decision, decided_at = now() where id = target_suggestion_id;
  return decision;
end;
$$;

create function public.record_taste_signal(target_screen_id uuid, signal_reason text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  uid uuid := auth.uid();
  screen_workspace uuid;
begin
  if uid is null then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  select workspace_id into screen_workspace from public.design_screens where id = target_screen_id;
  if screen_workspace is null or not public.is_workspace_member(screen_workspace) then
    raise exception 'not allowed' using errcode = '42501';
  end if;
  if signal_reason not in ('too_plain','too_busy','wrong_colours','wrong_layout','not_my_style') then
    raise exception 'invalid reason' using errcode = '22023';
  end if;
  insert into public.taste_signals (workspace_id, user_id, screen_id, reason)
  values (screen_workspace, uid, target_screen_id, signal_reason);
end;
$$;

revoke all on function public.taste_sorted_count(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.claim_taste_refresh(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.finish_taste_refresh(uuid, uuid, jsonb, jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.release_taste_refresh(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.save_taste_board(uuid, jsonb, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.decide_taste_suggestion(uuid, text, jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.record_taste_signal(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.claim_taste_refresh(uuid, uuid) to service_role;
grant execute on function public.finish_taste_refresh(uuid, uuid, jsonb, jsonb, integer) to service_role;
grant execute on function public.release_taste_refresh(uuid, uuid) to service_role;
grant execute on function public.save_taste_board(uuid, jsonb, integer, text) to authenticated;
grant execute on function public.decide_taste_suggestion(uuid, text, jsonb, integer) to authenticated;
grant execute on function public.record_taste_signal(uuid, text) to authenticated;
