-- Taste functions for the Shelf key (Mac app). The route has already resolved
-- the token to (actor, workspace); these never use auth.uid().
-- Board contents are validated in TypeScript (zod) before every write.

create function public.capture_get_taste(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  profile public.taste_profiles;
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  select * into profile from public.taste_profiles
  where workspace_id = target_workspace_id and user_id = actor_user_id and board is not null;
  if not found then
    return null;
  end if;
  return jsonb_build_object(
    'board', profile.board, 'version', profile.version,
    'apple_rules', profile.apple_rules, 'locks', profile.locks);
end;
$$;

create function public.capture_list_taste_suggestions(actor_user_id uuid, target_workspace_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  return coalesce((
    select jsonb_agg(jsonb_build_object(
      'id', s.id, 'tile', s.tile, 'op', s.op, 'value', s.value,
      'reason', s.reason, 'evidence_item_ids', to_jsonb(s.evidence_item_ids)) order by s.created_at, s.id)
    from public.taste_suggestions s
    where s.workspace_id = target_workspace_id and s.user_id = actor_user_id and s.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

create function public.capture_save_taste_board(
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
    ('designLanguage','colors','typography','spacing','density','layoutHabits','signatureDetails','avoid') then
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

create function public.capture_decide_taste_suggestion(
  actor_user_id uuid, target_suggestion_id uuid, decision text, new_board jsonb, expected_version integer
)
returns text
language plpgsql
security definer
set search_path = ''
as $$
declare
  suggestion public.taste_suggestions;
  current_version integer;
begin
  if decision not in ('kept', 'rejected') then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select * into suggestion from public.taste_suggestions
  where id = target_suggestion_id and user_id = actor_user_id
  for update;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
  if not public.inspiration_actor_is_member(actor_user_id, suggestion.workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if suggestion.status <> 'pending' then
    return suggestion.status;
  end if;
  select version into current_version from public.taste_profiles
  where workspace_id = suggestion.workspace_id and user_id = actor_user_id
  for update;
  if new_board is null or jsonb_typeof(new_board) <> 'object' or current_version is distinct from expected_version then
    update public.taste_suggestions set status = 'superseded', decided_at = now() where id = target_suggestion_id;
    return 'superseded';
  end if;
  update public.taste_profiles
  set board = new_board, version = version + 1, updated_at = now()
  where workspace_id = suggestion.workspace_id and user_id = actor_user_id;
  update public.taste_suggestions set status = decision, decided_at = now() where id = target_suggestion_id;
  return decision;
end;
$$;

create function public.capture_set_apple_rules(actor_user_id uuid, target_workspace_id uuid, enabled boolean)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  update public.taste_profiles set apple_rules = enabled, updated_at = now()
  where workspace_id = target_workspace_id and user_id = actor_user_id;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;
end;
$$;

revoke all on function public.capture_get_taste(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.capture_list_taste_suggestions(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.capture_save_taste_board(uuid, uuid, jsonb, integer, text) from public, anon, authenticated, service_role;
revoke all on function public.capture_decide_taste_suggestion(uuid, uuid, text, jsonb, integer) from public, anon, authenticated, service_role;
revoke all on function public.capture_set_apple_rules(uuid, uuid, boolean) from public, anon, authenticated, service_role;

grant execute on function public.capture_get_taste(uuid, uuid) to service_role;
grant execute on function public.capture_list_taste_suggestions(uuid, uuid) to service_role;
grant execute on function public.capture_save_taste_board(uuid, uuid, jsonb, integer, text) to service_role;
grant execute on function public.capture_decide_taste_suggestion(uuid, uuid, text, jsonb, integer) to service_role;
grant execute on function public.capture_set_apple_rules(uuid, uuid, boolean) to service_role;
