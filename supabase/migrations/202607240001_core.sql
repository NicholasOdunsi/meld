create type public.membership_role as enum ('admin', 'member');

create table public.organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 120),
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);

create table public.memberships (
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role public.membership_role not null default 'member',
  created_at timestamptz not null default now(),
  primary key (organization_id, user_id)
);

create index memberships_user_id_idx
  on public.memberships (user_id);

create table public.products (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  name text not null check (char_length(name) between 1 and 120),
  created_at timestamptz not null default now()
);

create index products_organization_id_idx
  on public.products (organization_id);

create function public.add_organization_creator_membership()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.memberships (organization_id, user_id, role)
  values (new.id, new.created_by, 'admin');

  return new;
end;
$$;

revoke all
  on function public.add_organization_creator_membership()
  from public;

create trigger add_organization_creator_membership
after insert on public.organizations
for each row
execute function public.add_organization_creator_membership();
