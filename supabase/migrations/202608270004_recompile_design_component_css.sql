-- recompileComponentCss (Task 8, apps/web) needs to overwrite a version's
-- stale component_css once a component build pass finishes: every batch
-- merge (202608270002) copies component_css forward unchanged from its
-- source version into the new row it inserts, so the column is stale the
-- moment a component is actually built into profile_json.
--
-- design_system_profile_versions rows are meant to be immutable because a
-- version id is the cache key everything downstream pins to (202608270002's
-- own comment on materialize_design_component_build explains this well).
-- But protect_design_profile_version() (202608130005), as written, does not
-- single out profile_json or any other column -- it raises unconditionally
-- on every UPDATE and DELETE, full stop:
--
--   begin
--     raise exception 'design_profile_version_immutable' using errcode = 'P0001';
--     return null;
--   end;
--
-- That blocks the one write this task needs to make, regardless of which
-- column it touches or which role makes it (a trigger fires on the write
-- itself, not on the caller's privileges). And authenticated has no UPDATE
-- grant on this table at all -- only SELECT (202608130005) -- so even a
-- trigger-exempt column would still need a security-definer entry point.
--
-- Narrowed here to the minimum both problems require: the trigger now
-- allows an UPDATE that changes component_css alone (every other column,
-- and any DELETE, is still refused exactly as before), and a dedicated
-- function is the only way to reach it -- mirroring how
-- set_active_design_profile_version is already the sanctioned way to move
-- the active pointer rather than a raw client-side update.
create or replace function public.protect_design_profile_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  if TG_OP = 'DELETE' then
    raise exception 'design_profile_version_immutable' using errcode = 'P0001';
  end if;

  if new.id is distinct from old.id
    or new.workspace_id is distinct from old.workspace_id
    or new.profile_json is distinct from old.profile_json
    or new.token_css is distinct from old.token_css
    or new.source_object_path is distinct from old.source_object_path
    or new.created_by is distinct from old.created_by
    or new.created_at is distinct from old.created_at
  then
    raise exception 'design_profile_version_immutable' using errcode = 'P0001';
  end if;

  return new;
end;
$$;

-- The only sanctioned way to touch component_css after a version already
-- exists. Checks membership itself rather than leaning on RLS (this table
-- grants authenticated SELECT only), the same shape
-- set_active_design_profile_version uses for the same reason.
create function public.set_design_component_css(target_version_id uuid, css text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  target_workspace uuid;
begin
  select version.workspace_id into target_workspace
  from public.design_system_profile_versions as version
  where version.id = target_version_id;

  if target_workspace is null then
    raise exception 'design_profile_version_not_found' using errcode = 'P0001';
  end if;
  if not public.is_workspace_member(target_workspace) then
    raise exception 'not_authorized' using errcode = 'P0001';
  end if;

  update public.design_system_profile_versions
  set component_css = css
  where id = target_version_id;
end;
$$;

revoke all on function public.set_design_component_css(uuid, text) from public, anon, authenticated, service_role;
grant execute on function public.set_design_component_css(uuid, text) to authenticated;
