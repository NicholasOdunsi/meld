create extension if not exists pgcrypto with schema extensions;

create type public.invitation_delivery_status
as enum ('pending', 'sent', 'failed');

create table public.invitations (
  id uuid primary key,
  organization_id uuid not null
    references public.organizations(id) on delete cascade,
  email text not null
    check (email = lower(btrim(email)))
    check (
      email ~ '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
    ),
  invited_by uuid not null references auth.users(id),
  invited_by_name text not null
    check (char_length(invited_by_name) between 1 and 200),
  organization_name text not null
    check (char_length(organization_name) between 1 and 120),
  token_hash bytea not null unique
    check (octet_length(token_hash) = 32),
  expires_at timestamptz not null default (now() + interval '7 days'),
  accepted_at timestamptz,
  revoked_at timestamptz,
  delivery_status public.invitation_delivery_status not null
    default 'pending',
  provider_message_id text,
  delivery_attempted_at timestamptz,
  created_at timestamptz not null default now(),
  check (not (accepted_at is not null and revoked_at is not null))
);

create unique index invitations_active_organization_email_idx
  on public.invitations (organization_id, email)
  where accepted_at is null and revoked_at is null;

create index invitations_organization_id_idx
  on public.invitations (organization_id);

create function public.create_organization_with_product(
  organization_name text,
  product_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  created_organization public.organizations;
  created_product public.products;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  organization_name := btrim(organization_name);
  product_name := btrim(product_name);

  if organization_name is null
    or char_length(organization_name) not between 1 and 120
    or product_name is null
    or char_length(product_name) not between 1 and 120
  then
    raise exception 'Organization and product names are required'
      using errcode = 'P0001';
  end if;

  insert into public.organizations (name, created_by)
  values (organization_name, current_user_id)
  returning * into created_organization;

  insert into public.products (organization_id, name)
  values (created_organization.id, product_name)
  returning * into created_product;

  return jsonb_build_object(
    'organization_id', created_organization.id,
    'organization_name', created_organization.name,
    'product_id', created_product.id,
    'product_name', created_product.name
  );
end;
$$;

create function public.create_invitation(
  target_organization_id uuid,
  invitee_email text,
  invitation_id uuid,
  invitation_token_hash text,
  inviter_display_name text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  normalized_email text := lower(btrim(invitee_email));
  normalized_inviter_name text := btrim(inviter_display_name);
  organization_name text;
  created_invitation public.invitations;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not public.is_org_admin(target_organization_id) then
    raise exception 'Only organization admins can invite members'
      using errcode = 'P0001';
  end if;

  if normalized_email is null
    or normalized_email !~
      '^[^[:space:]@]+@[^[:space:]@]+\.[^[:space:]@]+$'
  then
    raise exception 'A valid invitation email is required'
      using errcode = 'P0001';
  end if;

  if invitation_id is null
    or invitation_token_hash is null
    or invitation_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invalid invitation token material'
      using errcode = 'P0001';
  end if;

  if normalized_inviter_name is null
    or char_length(normalized_inviter_name) not between 1 and 200
  then
    raise exception 'A valid inviter display name is required'
      using errcode = 'P0001';
  end if;

  if exists (
    select 1
    from public.memberships as membership
    join auth.users as member_user
      on member_user.id = membership.user_id
    where membership.organization_id = target_organization_id
      and lower(btrim(member_user.email)) = normalized_email
  ) then
    raise exception 'This person is already an organization member'
      using errcode = 'P0001';
  end if;

  select organization.name
  into organization_name
  from public.organizations as organization
  where organization.id = target_organization_id;

  insert into public.invitations (
    id,
    organization_id,
    email,
    invited_by,
    invited_by_name,
    organization_name,
    token_hash
  )
  values (
    invitation_id,
    target_organization_id,
    normalized_email,
    current_user_id,
    normalized_inviter_name,
    organization_name,
    decode(invitation_token_hash, 'hex')
  )
  returning * into created_invitation;

  return jsonb_build_object(
    'invitation_id', created_invitation.id,
    'organization_name', created_invitation.organization_name,
    'invited_by_name', created_invitation.invited_by_name,
    'email', created_invitation.email,
    'expires_at', created_invitation.expires_at
  );
exception
  when unique_violation then
    raise exception
      'An active invitation already exists; revoke it before creating another'
      using errcode = 'P0001';
end;
$$;

create function public.authorize_invitation_delivery(
  target_organization_id uuid,
  invitation_id uuid,
  invitation_token_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  invitation_record public.invitations;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not public.is_org_admin(target_organization_id) then
    raise exception 'Only organization admins can retry invitations'
      using errcode = 'P0001';
  end if;

  if invitation_token_hash is null
    or invitation_token_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception 'Invitation token verification failed'
      using errcode = 'P0001';
  end if;

  select invitation.*
  into invitation_record
  from public.invitations as invitation
  where invitation.id = invitation_id
    and invitation.organization_id = target_organization_id
  for update;

  if invitation_record.id is null
    or invitation_record.accepted_at is not null
    or invitation_record.revoked_at is not null
    or invitation_record.expires_at <= now()
    or invitation_record.delivery_status not in ('pending', 'failed')
    or invitation_record.token_hash <>
      decode(invitation_token_hash, 'hex')
  then
    raise exception 'Invitation token verification failed'
      using errcode = 'P0001';
  end if;

  return jsonb_build_object(
    'invitation_id', invitation_record.id,
    'organization_name', invitation_record.organization_name,
    'invited_by_name', invitation_record.invited_by_name,
    'email', invitation_record.email,
    'delivery_status', invitation_record.delivery_status,
    'token_hash_matches', true
  );
end;
$$;

create function public.mark_invitation_delivery(
  target_organization_id uuid,
  invitation_id uuid,
  delivery_status public.invitation_delivery_status,
  provider_message_id text default null
)
returns public.invitation_delivery_status
language plpgsql
security definer
set search_path = ''
as $$
declare
  final_delivery_status public.invitation_delivery_status;
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not public.is_org_admin(target_organization_id) then
    raise exception 'Only organization admins can update invitations'
      using errcode = 'P0001';
  end if;

  if delivery_status = 'pending' then
    raise exception 'Delivery status must be final'
      using errcode = 'P0001';
  end if;

  update public.invitations as invitation
  set
    delivery_status = case
      when invitation.delivery_status = 'sent' then 'sent'
      else mark_invitation_delivery.delivery_status
    end,
    provider_message_id = case
      when invitation.delivery_status = 'sent'
        then invitation.provider_message_id
      when mark_invitation_delivery.delivery_status = 'sent'
        then mark_invitation_delivery.provider_message_id
      else invitation.provider_message_id
    end,
    delivery_attempted_at = now()
  where invitation.id = invitation_id
    and invitation.organization_id = target_organization_id
    and invitation.accepted_at is null
    and invitation.revoked_at is null
  returning invitation.delivery_status into final_delivery_status;

  if not found then
    raise exception 'Active invitation not found' using errcode = 'P0001';
  end if;

  return final_delivery_status;
end;
$$;

create function public.revoke_invitation(
  target_organization_id uuid,
  invitation_id uuid
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not public.is_org_admin(target_organization_id) then
    raise exception 'Only organization admins can revoke invitations'
      using errcode = 'P0001';
  end if;

  update public.invitations as invitation
  set revoked_at = now()
  where invitation.id = invitation_id
    and invitation.organization_id = target_organization_id
    and invitation.accepted_at is null
    and invitation.revoked_at is null;

  if not found then
    raise exception 'Active invitation not found' using errcode = 'P0001';
  end if;
end;
$$;

create function public.accept_invitation(invitation_token text)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  current_user_id uuid := auth.uid();
  current_user_email text;
  invitation_record public.invitations;
  organization_name text;
begin
  if current_user_id is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if invitation_token is null
    or invitation_token !~ '^[A-Za-z0-9_-]{43}$'
  then
    raise exception 'Invitation is invalid, expired, or already used'
      using errcode = 'P0001';
  end if;

  select lower(btrim(auth_user.email))
  into current_user_email
  from auth.users as auth_user
  where auth_user.id = current_user_id;

  if current_user_email is null then
    raise exception 'Authenticated user must have an email address'
      using errcode = 'P0001';
  end if;

  select invitation.*
  into invitation_record
  from public.invitations as invitation
  where invitation.token_hash =
    extensions.digest(
      convert_to(invitation_token, 'UTF8'),
      'sha256'
    )
  for update;

  if invitation_record.id is null
    or invitation_record.accepted_at is not null
    or invitation_record.revoked_at is not null
    or invitation_record.expires_at <= now()
  then
    raise exception 'Invitation is invalid, expired, or already used'
      using errcode = 'P0001';
  end if;

  if invitation_record.email <> current_user_email then
    raise exception 'Invitation email does not match authenticated user'
      using errcode = 'P0001';
  end if;

  insert into public.memberships (organization_id, user_id, role)
  values (
    invitation_record.organization_id,
    current_user_id,
    'member'
  )
  on conflict (organization_id, user_id) do nothing;

  update public.invitations
  set accepted_at = now()
  where id = invitation_record.id;

  select organization.name
  into organization_name
  from public.organizations as organization
  where organization.id = invitation_record.organization_id;

  return jsonb_build_object(
    'organization_id', invitation_record.organization_id,
    'organization_name', organization_name
  );
end;
$$;

create function public.list_organization_members(
  target_organization_id uuid
)
returns table (
  user_id uuid,
  email text,
  role public.membership_role,
  created_at timestamptz
)
language plpgsql
stable
security definer
set search_path = ''
as $$
begin
  if auth.uid() is null then
    raise exception 'Authentication required' using errcode = 'P0001';
  end if;

  if not public.is_org_member(target_organization_id) then
    raise exception 'Organization membership required'
      using errcode = 'P0001';
  end if;

  return query
  select
    membership.user_id,
    lower(btrim(auth_user.email)),
    membership.role,
    membership.created_at
  from public.memberships as membership
  join auth.users as auth_user
    on auth_user.id = membership.user_id
  where membership.organization_id = target_organization_id
  order by membership.created_at, membership.user_id;
end;
$$;

alter table public.invitations enable row level security;

revoke all on table public.invitations from anon;
revoke all on table public.invitations from authenticated;
grant select on table public.invitations to authenticated;

create policy "Admins can view organization invitations"
on public.invitations
for select
to authenticated
using (public.is_org_admin(organization_id));

revoke all
  on function public.create_organization_with_product(text, text)
  from public;
revoke all
  on function public.create_invitation(uuid, text, uuid, text, text)
  from public;
revoke all
  on function public.authorize_invitation_delivery(uuid, uuid, text)
  from public;
revoke all
  on function public.mark_invitation_delivery(
    uuid,
    uuid,
    public.invitation_delivery_status,
    text
  )
  from public;
revoke all
  on function public.revoke_invitation(uuid, uuid)
  from public;
revoke all
  on function public.accept_invitation(text)
  from public;
revoke all
  on function public.list_organization_members(uuid)
  from public;

grant execute
  on function public.create_organization_with_product(text, text)
  to authenticated;
grant execute
  on function public.create_invitation(uuid, text, uuid, text, text)
  to authenticated;
grant execute
  on function public.authorize_invitation_delivery(uuid, uuid, text)
  to authenticated;
grant execute
  on function public.mark_invitation_delivery(
    uuid,
    uuid,
    public.invitation_delivery_status,
    text
  )
  to authenticated;
grant execute
  on function public.revoke_invitation(uuid, uuid)
  to authenticated;
grant execute
  on function public.accept_invitation(text)
  to authenticated;
grant execute
  on function public.list_organization_members(uuid)
  to authenticated;
