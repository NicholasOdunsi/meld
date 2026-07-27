begin;

create extension if not exists pgtap with schema extensions;

select plan(5);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '10000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'author@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '10000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'mentioned@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

insert into public.organizations (id, name, created_by)
values (
  '20000000-0000-4000-8000-000000000001',
  'Northstar',
  auth.uid()
);

insert into public.memberships (organization_id, user_id, role)
values (
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'member'
);

insert into public.discovery_rooms (id, organization_id, name, owner_id)
values (
  '40000000-0000-4000-8000-000000000004',
  '20000000-0000-4000-8000-000000000001',
  'Checkout',
  '10000000-0000-4000-8000-000000000001'
);

insert into public.room_participants (room_id, user_id, access)
values (
  '40000000-0000-4000-8000-000000000004',
  '10000000-0000-4000-8000-000000000002',
  'edit'
);

insert into public.messages (id, room_id, client_id, author_id, body)
values (
  '60000000-0000-4000-8000-000000000006',
  '40000000-0000-4000-8000-000000000004',
  '70000000-0000-4000-8000-000000000007',
  '10000000-0000-4000-8000-000000000001',
  'Can you look at this, @mentioned?'
);

insert into public.mentions (
  id, room_id, message_id, mentioned_user_id, created_by
)
values (
  '50000000-0000-4000-8000-000000000005',
  '40000000-0000-4000-8000-000000000004',
  '60000000-0000-4000-8000-000000000006',
  '10000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

-- What this assertion actually proves, and what it does not:
--
-- The `where mentioned_user_id = auth.uid()` here is in the *test query*,
-- not enforced by the database. The real SELECT policy on public.mentions
-- is `using (is_room_participant(room_id))` -- room participation only. Any
-- participant of room 40000000-0000-4000-8000-000000000004 (not just the
-- mentioned user) can select every mention row in that room, including this
-- one, regardless of mentioned_user_id.
--
-- That is an accepted gap, not a bug: a room participant can already read
-- the same "@mentioned" text directly in the message body (see the insert
-- into public.messages above), so RLS withholding the mentions row would
-- not withhold any information the participant doesn't already have. The
-- application layer (apps/web/src/features/home/attention/mention-resolver.ts)
-- is what narrows "unacknowledged mentions" down to the requesting user's
-- own, by filtering on mentioned_user_id itself -- the database does not.
--
-- This assertion therefore only proves the count is 1 for this fixture,
-- not that the database enforces a per-user boundary. See the assertion
-- below (once the session switches to the room owner, who is not the
-- mentioned user) for the actual database-enforced boundary.
select is(
  (
    select count(*)::int from public.mentions
    where mentioned_user_id = auth.uid()
      and acknowledged_at is null
  ),
  1,
  'the mentioned user sees one unacknowledged mention'
);

update public.mentions
  set acknowledged_at = now()
  where mentioned_user_id = auth.uid();

select is(
  (
    select count(*)::int from public.mentions
    where mentioned_user_id = auth.uid()
      and acknowledged_at is null
  ),
  0,
  'acknowledging clears it from the unacknowledged set'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000001',
  true
);

-- Documents the actual database-enforced SELECT boundary: user 1 (the room
-- owner/author) is a participant in the room but is NOT the
-- mentioned_user_id on this mention row (that's user 2). RLS still returns
-- it, because "Participants can view mentions" is keyed on
-- is_room_participant(room_id) alone -- it has no mentioned_user_id clause.
-- This is what assertion 1 above cannot show, since its own query adds
-- that clause itself rather than the database enforcing it.
select is(
  (
    select count(*)::int from public.mentions
    where id = '50000000-0000-4000-8000-000000000005'
  ),
  1,
  'RLS lets a room participant read a mention addressed to someone else -- room participation, not mentioned_user_id, is what SELECT enforces'
);

update public.mentions set acknowledged_at = null;

select is(
  (
    select count(*)::int from public.mentions
    where acknowledged_at is null
  ),
  0,
  'a participant cannot un-acknowledge another user''s mention'
);

select set_config(
  'request.jwt.claim.sub',
  '10000000-0000-4000-8000-000000000002',
  true
);

select throws_ok(
  $$
    update public.mentions
      set mentioned_user_id = '10000000-0000-4000-8000-000000000001',
          acknowledged_at = now()
      where mentioned_user_id = auth.uid()
  $$,
  '42501',
  null,
  'a user cannot reassign their own mention to another user'
);

select * from finish();
rollback;
