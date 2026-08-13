-- Workspace-scoped design-system profile: one row per workspace, pointing at
-- the active immutable version. Profile data is validated in the contract;
-- Meld compiles the token CSS deterministically.
create table public.design_system_profiles (
  workspace_id uuid primary key references public.workspaces(id) on delete cascade,
  active_version_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.design_system_profile_versions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid not null references public.workspaces(id) on delete cascade,
  profile_json jsonb not null,
  token_css text not null,
  source_object_path text,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  constraint design_profile_version_size
    check (octet_length(profile_json::text) <= 65536),
  constraint design_profile_token_css_size
    check (octet_length(token_css) <= 65536)
);

alter table public.design_system_profiles
  add constraint design_system_profiles_active_version_fkey
  foreign key (active_version_id)
  references public.design_system_profile_versions(id);

create index design_profile_versions_workspace
  on public.design_system_profile_versions(workspace_id, created_at);

create function public.protect_design_profile_version()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  raise exception 'design_profile_version_immutable' using errcode = 'P0001';
  return null;
end;
$$;

revoke all on function public.protect_design_profile_version() from public, anon, authenticated, service_role;
grant execute on function public.protect_design_profile_version()
  to service_role;

create trigger design_profile_version_immutable
before update or delete on public.design_system_profile_versions
for each row execute function public.protect_design_profile_version();

alter table public.design_system_profiles enable row level security;
revoke all on table public.design_system_profiles from anon, authenticated;
grant select on table public.design_system_profiles to authenticated;
create policy "Members can view design profile"
on public.design_system_profiles for select to authenticated
using (public.is_workspace_member(workspace_id));

alter table public.design_system_profile_versions enable row level security;
revoke all on table public.design_system_profile_versions from anon, authenticated;
grant select on table public.design_system_profile_versions to authenticated;
create policy "Members can view design profile versions"
on public.design_system_profile_versions for select to authenticated
using (public.is_workspace_member(workspace_id));

create function public.set_active_design_profile_version(target_version_id uuid)
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

  insert into public.design_system_profiles as profile (
    workspace_id,
    active_version_id,
    updated_at
  ) values (
    target_workspace,
    target_version_id,
    now()
  )
  on conflict (workspace_id) do update
  set active_version_id = excluded.active_version_id,
      updated_at = now();
end;
$$;

revoke all on function public.set_active_design_profile_version(uuid) from public, anon, authenticated, service_role;
grant execute on function public.set_active_design_profile_version(uuid)
  to authenticated;

create function public.storage_workspace_id(object_name text)
returns uuid
language plpgsql
immutable
security definer
set search_path = ''
as $$
begin
  if object_name is null
    or object_name !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/[^/].*$'
    or object_name ~ '(^|/)\.\.?(/|$)'
  then
    return null;
  end if;
  return split_part(object_name, '/', 1)::uuid;
exception when others then
  return null;
end;
$$;

revoke all on function public.storage_workspace_id(text) from public, anon, authenticated, service_role;
grant execute on function public.storage_workspace_id(text) to authenticated;

insert into storage.buckets (
  id,
  name,
  public,
  file_size_limit,
  allowed_mime_types
) values (
  'design-system',
  'design-system',
  false,
  10485760,
  array['text/plain', 'text/markdown', 'application/pdf']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy "Members can read design-system objects"
on storage.objects for select to authenticated
using (
  bucket_id = 'design-system'
  and public.is_workspace_member(public.storage_workspace_id(name))
);

create policy "Members can upload design-system objects"
on storage.objects for insert to authenticated
with check (
  bucket_id = 'design-system'
  and owner_id = auth.uid()::text
  and public.is_workspace_member(public.storage_workspace_id(name))
);

create policy "Members can update design-system objects"
on storage.objects for update to authenticated
using (
  bucket_id = 'design-system'
  and public.is_workspace_member(public.storage_workspace_id(name))
)
with check (
  bucket_id = 'design-system'
  and public.is_workspace_member(public.storage_workspace_id(name))
);

create policy "Members can delete design-system objects"
on storage.objects for delete to authenticated
using (
  bucket_id = 'design-system'
  and public.is_workspace_member(public.storage_workspace_id(name))
);
