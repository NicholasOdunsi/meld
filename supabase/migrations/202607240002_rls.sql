create function public.is_org_member(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where organization_id = target_org
      and user_id = auth.uid()
  );
$$;

create function public.is_org_admin(target_org uuid)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.memberships
    where organization_id = target_org
      and user_id = auth.uid()
      and role = 'admin'
  );
$$;

revoke all on function public.is_org_member(uuid) from public;
revoke all on function public.is_org_admin(uuid) from public;
grant execute on function public.is_org_member(uuid) to authenticated;
grant execute on function public.is_org_admin(uuid) to authenticated;

alter table public.organizations enable row level security;
alter table public.memberships enable row level security;
alter table public.products enable row level security;

revoke all on table public.organizations from anon;
revoke all on table public.memberships from anon;
revoke all on table public.products from anon;

grant select, insert, update
  on table public.organizations
  to authenticated;
grant select, insert, update, delete
  on table public.memberships
  to authenticated;
grant select, insert, update, delete
  on table public.products
  to authenticated;

create policy "Members can view their organizations"
on public.organizations
for select
to authenticated
using (public.is_org_member(id));

create policy "Authenticated users can create organizations"
on public.organizations
for insert
to authenticated
with check (created_by = auth.uid());

create policy "Admins can update their organizations"
on public.organizations
for update
to authenticated
using (public.is_org_admin(id))
with check (public.is_org_admin(id));

create policy "Members can view organization memberships"
on public.memberships
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "Admins can add organization memberships"
on public.memberships
for insert
to authenticated
with check (public.is_org_admin(organization_id));

create policy "Admins can update organization memberships"
on public.memberships
for update
to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "Admins can delete organization memberships"
on public.memberships
for delete
to authenticated
using (public.is_org_admin(organization_id));

create policy "Members can view organization products"
on public.products
for select
to authenticated
using (public.is_org_member(organization_id));

create policy "Admins can create organization products"
on public.products
for insert
to authenticated
with check (public.is_org_admin(organization_id));

create policy "Admins can update organization products"
on public.products
for update
to authenticated
using (public.is_org_admin(organization_id))
with check (public.is_org_admin(organization_id));

create policy "Admins can delete organization products"
on public.products
for delete
to authenticated
using (public.is_org_admin(organization_id));
