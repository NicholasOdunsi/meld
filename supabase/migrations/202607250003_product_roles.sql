create type public.product_role as enum (
  'product_manager',
  'product_leader',
  'product_designer',
  'design_engineer',
  'engineer',
  'stakeholder'
);

alter table public.invitations
add column product_role public.product_role;

alter table public.memberships
add column product_role public.product_role;

drop function public.create_invitation(uuid, text, uuid, text, text);

create function public.create_invitation(
  target_organization_id uuid,
  invitee_email text,
  invitation_id uuid,
  invitation_token_hash text,
  inviter_display_name text,
  invitee_product_role text
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
  normalized_product_role text := btrim(invitee_product_role);
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

  if normalized_product_role is null
    or not exists (
      select 1
      from unnest(enum_range(null::public.product_role)) as role_value
      where role_value::text = normalized_product_role
    )
  then
    raise exception 'A valid product role is required'
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
    token_hash,
    product_role
  )
  values (
    invitation_id,
    target_organization_id,
    normalized_email,
    current_user_id,
    normalized_inviter_name,
    organization_name,
    decode(invitation_token_hash, 'hex'),
    normalized_product_role::public.product_role
  )
  returning * into created_invitation;

  return jsonb_build_object(
    'invitation_id', created_invitation.id,
    'organization_name', created_invitation.organization_name,
    'invited_by_name', created_invitation.invited_by_name,
    'email', created_invitation.email,
    'product_role', created_invitation.product_role,
    'expires_at', created_invitation.expires_at
  );
exception
  when unique_violation then
    raise exception
      'An active invitation already exists; revoke it before creating another'
      using errcode = 'P0001';
end;
$$;

drop function public.accept_invitation(text);

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

  insert into public.memberships (
    organization_id,
    user_id,
    role,
    product_role
  )
  values (
    invitation_record.organization_id,
    current_user_id,
    'member',
    invitation_record.product_role
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

drop function public.list_organization_members(uuid);

create function public.list_organization_members(
  target_organization_id uuid
)
returns table (
  user_id uuid,
  email text,
  role public.membership_role,
  product_role public.product_role,
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
    membership.product_role,
    membership.created_at
  from public.memberships as membership
  join auth.users as auth_user
    on auth_user.id = membership.user_id
  where membership.organization_id = target_organization_id
  order by membership.created_at, membership.user_id;
end;
$$;

revoke all
  on function public.create_invitation(
    uuid,
    text,
    uuid,
    text,
    text,
    text
  )
  from public;
revoke all
  on function public.accept_invitation(text)
  from public;
revoke all
  on function public.list_organization_members(uuid)
  from public;

grant execute
  on function public.create_invitation(
    uuid,
    text,
    uuid,
    text,
    text,
    text
  )
  to authenticated;
grant execute
  on function public.accept_invitation(text)
  to authenticated;
grant execute
  on function public.list_organization_members(uuid)
  to authenticated;
