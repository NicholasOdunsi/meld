-- Remove the Apple rules switch (spec: 2026-11-10-taste-style-guide-board-design.md, B8).
-- capture_get_taste is replaced first (it reads the column), then the function and column go.
-- create or replace keeps the existing grants (service_role only).

create or replace function public.capture_get_taste(actor_user_id uuid, target_workspace_id uuid)
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
    'board', profile.board, 'version', profile.version, 'locks', profile.locks);
end;
$$;

drop function public.capture_set_apple_rules(uuid, uuid, boolean);

alter table public.taste_profiles drop column apple_rules;
