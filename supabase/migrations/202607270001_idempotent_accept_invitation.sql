-- Make accept_invitation idempotent for the invitee who already accepted it.
--
-- Previously, re-submitting an invitation link after it had already been
-- accepted always raised "Invitation is invalid, expired, or already used" —
-- even when the person re-submitting was the same invitee who is already a
-- member. That left users who revisited their invite email (or double
-- clicked the accept button) stuck on the invitation screen with no way
-- forward. Now, if the requesting user already holds the membership that
-- this invitation granted, accepting again simply returns the organization
-- again instead of failing.

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
  already_member boolean;
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

  if invitation_record.accepted_at is not null then
    select exists (
      select 1
      from public.memberships as membership
      where membership.organization_id = invitation_record.organization_id
        and membership.user_id = current_user_id
    )
    into already_member;

    if not already_member then
      raise exception 'Invitation is invalid, expired, or already used'
        using errcode = 'P0001';
    end if;

    select organization.name
    into organization_name
    from public.organizations as organization
    where organization.id = invitation_record.organization_id;

    return jsonb_build_object(
      'organization_id', invitation_record.organization_id,
      'organization_name', organization_name
    );
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

revoke all
  on function public.accept_invitation(text)
  from public;
grant execute
  on function public.accept_invitation(text)
  to authenticated;
