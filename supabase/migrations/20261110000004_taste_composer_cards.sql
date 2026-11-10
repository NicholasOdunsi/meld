-- Composer / preset cards land in taste_suggestions with origin + source.
-- capture_add_taste_cards is service_role-only (Shelf key already resolved).

alter table public.taste_suggestions
  add column origin text not null default 'learning' check (origin in ('learning','composer','preset')),
  add column source jsonb check (source is null or jsonb_typeof(source) = 'object');

create function public.capture_add_taste_cards(
  actor_user_id uuid, target_workspace_id uuid, cards jsonb, replace_ids uuid[]
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  profile_version integer;
  batch uuid := gen_random_uuid();
  item jsonb;
  new_id uuid;
  ids jsonb := '[]'::jsonb;
begin
  if not public.inspiration_actor_is_member(actor_user_id, target_workspace_id) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;
  if cards is null or jsonb_typeof(cards) <> 'array' or jsonb_array_length(cards) > 8 then
    raise exception 'invalid_request' using errcode = 'P0001';
  end if;
  select version into profile_version from public.taste_profiles
  where workspace_id = target_workspace_id and user_id = actor_user_id and board is not null;
  if not found then
    raise exception 'not_found' using errcode = 'P0001';
  end if;

  update public.taste_suggestions set status = 'superseded', decided_at = now()
  where id = any (replace_ids) and user_id = actor_user_id and workspace_id = target_workspace_id and status = 'pending';

  for item in select * from jsonb_array_elements(cards) loop
    insert into public.taste_suggestions
      (workspace_id, user_id, refresh_id, tile, op, value, value_key, reason, board_version, origin, source)
    values
      (target_workspace_id, actor_user_id, batch, item->>'tile', item->>'op', item->'value',
       item->>'value_key', item->>'reason', profile_version, item->>'origin', item->'source')
    returning id into new_id;
    ids := ids || to_jsonb(new_id);
  end loop;
  return ids;
end;
$$;

create function public.capture_rejected_taste_keys(actor_user_id uuid, target_workspace_id uuid)
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
    select jsonb_agg(distinct value_key) from public.taste_suggestions
    where workspace_id = target_workspace_id and user_id = actor_user_id and status = 'rejected'
  ), '[]'::jsonb);
end;
$$;

create or replace function public.capture_list_taste_suggestions(actor_user_id uuid, target_workspace_id uuid)
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
      'reason', s.reason, 'evidence_item_ids', to_jsonb(s.evidence_item_ids),
      'origin', s.origin, 'source', s.source) order by s.created_at, s.id)
    from public.taste_suggestions s
    where s.workspace_id = target_workspace_id and s.user_id = actor_user_id and s.status = 'pending'
  ), '[]'::jsonb);
end;
$$;

revoke all on function public.capture_add_taste_cards(uuid, uuid, jsonb, uuid[]) from public, anon, authenticated, service_role;
revoke all on function public.capture_rejected_taste_keys(uuid, uuid) from public, anon, authenticated, service_role;
grant execute on function public.capture_add_taste_cards(uuid, uuid, jsonb, uuid[]) to service_role;
grant execute on function public.capture_rejected_taste_keys(uuid, uuid) to service_role;
