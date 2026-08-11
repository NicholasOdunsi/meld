begin;

create extension if not exists pgtap with schema extensions;

select plan(9);

select has_function(
  'public'::name,
  'list_workspace_attention'::name,
  '{}'::name[],
  'the workspace attention summary exists'::text
);
select function_returns(
  'public'::name,
  'list_workspace_attention'::name,
  '{}'::name[],
  'setof record'::name,
  'the workspace attention summary returns rows'::text
);
select ok(
  not has_function_privilege(
    'anon',
    'public.list_workspace_attention()',
    'EXECUTE'
  ),
  'anonymous users cannot read workspace attention'::text
);

-- The privacy contract of this function is its output shape: a workspace id
-- and a boolean, and nothing that could name the Room, the message, or the
-- client the attention concerns. The function takes no arguments, so
-- proargnames holds exactly its output columns.
select is(
  (
    select string_agg(output_column.name, ',' order by output_column.ordinality)
    from pg_proc as procedure,
      unnest(procedure.proargnames)
        with ordinality as output_column(name, ordinality)
    where procedure.proname = 'list_workspace_attention'
      and procedure.pronamespace = 'public'::regnamespace
  ),
  'workspace_id,has_attention',
  'the summary exposes only a workspace id and a boolean'::text
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '19000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'attention-member@example.com', '', now(),
    '{}', '{}', now(), now()
  ),
  (
    '19000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'attention-author@example.com', '', now(),
    '{}', '{}', now(), now()
  ),
  (
    '19000000-0000-4000-8000-000000000003', 'authenticated',
    'authenticated', 'attention-outsider@example.com', '', now(),
    '{}', '{}', now(), now()
  );

-- Creating a workspace makes its creator an admin member, so the member under
-- test administers both of their own workspaces and belongs to neither the
-- third one nor its Room.
insert into public.workspaces (id, name, created_by)
values
  (
    '29000000-0000-4000-8000-000000000001',
    'Attention participant workspace',
    '19000000-0000-4000-8000-000000000001'
  ),
  (
    '29000000-0000-4000-8000-000000000002',
    'Attention bystander workspace',
    '19000000-0000-4000-8000-000000000001'
  ),
  (
    '29000000-0000-4000-8000-000000000003',
    'Attention foreign workspace',
    '19000000-0000-4000-8000-000000000003'
  );

insert into public.memberships (workspace_id, user_id, role)
values
  (
    '29000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000002',
    'member'
  ),
  (
    '29000000-0000-4000-8000-000000000002',
    '19000000-0000-4000-8000-000000000002',
    'member'
  );

insert into public.projects (id, workspace_id, name, created_by)
values
  (
    '79000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000001',
    'Attention participant project',
    '19000000-0000-4000-8000-000000000001'
  ),
  (
    '79000000-0000-4000-8000-000000000002',
    '29000000-0000-4000-8000-000000000002',
    'Attention bystander project',
    '19000000-0000-4000-8000-000000000001'
  ),
  (
    '79000000-0000-4000-8000-000000000003',
    '29000000-0000-4000-8000-000000000003',
    'Attention foreign project',
    '19000000-0000-4000-8000-000000000003'
  );

insert into public.rooms (id, workspace_id, project_id, name, owner_id)
values
  (
    '49000000-0000-4000-8000-000000000001',
    '29000000-0000-4000-8000-000000000001',
    '79000000-0000-4000-8000-000000000001',
    'Attention participant room',
    '19000000-0000-4000-8000-000000000002'
  ),
  (
    '49000000-0000-4000-8000-000000000002',
    '29000000-0000-4000-8000-000000000002',
    '79000000-0000-4000-8000-000000000002',
    'Attention bystander room',
    '19000000-0000-4000-8000-000000000002'
  ),
  (
    '49000000-0000-4000-8000-000000000003',
    '29000000-0000-4000-8000-000000000003',
    '79000000-0000-4000-8000-000000000003',
    'Attention foreign room',
    '19000000-0000-4000-8000-000000000003'
  );

-- Room owners are added as participants by trigger, so only the member under
-- test needs adding: they participate in the first Room, and administer the
-- second Room's workspace without ever being a participant of it.
insert into public.room_participants (room_id, user_id, access, added_by)
values (
  '49000000-0000-4000-8000-000000000001',
  '19000000-0000-4000-8000-000000000001',
  'edit',
  '19000000-0000-4000-8000-000000000002'
);

insert into public.messages (id, room_id, client_id, author_id, body)
values
  (
    '69000000-0000-4000-8000-000000000001',
    '49000000-0000-4000-8000-000000000001',
    '89000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000002',
    'Acme Corp renewal is at risk, @attention-member'
  ),
  (
    '69000000-0000-4000-8000-000000000002',
    '49000000-0000-4000-8000-000000000002',
    '89000000-0000-4000-8000-000000000002',
    '19000000-0000-4000-8000-000000000002',
    'Only the participants of this Room should feel this, @attention-member'
  ),
  (
    '69000000-0000-4000-8000-000000000003',
    '49000000-0000-4000-8000-000000000003',
    '89000000-0000-4000-8000-000000000003',
    '19000000-0000-4000-8000-000000000003',
    'A workspace elsewhere, @attention-outsider'
  ),
  (
    '69000000-0000-4000-8000-000000000004',
    '49000000-0000-4000-8000-000000000001',
    '89000000-0000-4000-8000-000000000004',
    '19000000-0000-4000-8000-000000000001',
    'Over to you on the renewal, @attention-author'
  );

insert into public.mentions (
  id, room_id, message_id, mentioned_user_id, created_by
)
values
  (
    '59000000-0000-4000-8000-000000000001',
    '49000000-0000-4000-8000-000000000001',
    '69000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000002'
  ),
  (
    '59000000-0000-4000-8000-000000000002',
    '49000000-0000-4000-8000-000000000002',
    '69000000-0000-4000-8000-000000000002',
    '19000000-0000-4000-8000-000000000001',
    '19000000-0000-4000-8000-000000000002'
  ),
  (
    '59000000-0000-4000-8000-000000000003',
    '49000000-0000-4000-8000-000000000003',
    '69000000-0000-4000-8000-000000000003',
    '19000000-0000-4000-8000-000000000003',
    '19000000-0000-4000-8000-000000000003'
  ),
  -- A mention of somebody else, left unacknowledged, in the very Room the
  -- member under test participates in. Attention is personal: being able to
  -- read a Room is not the same as being the one who was called on.
  (
    '59000000-0000-4000-8000-000000000004',
    '49000000-0000-4000-8000-000000000001',
    '69000000-0000-4000-8000-000000000004',
    '19000000-0000-4000-8000-000000000002',
    '19000000-0000-4000-8000-000000000001'
  );

set local role authenticated;
select set_config(
  'request.jwt.claim.sub',
  '19000000-0000-4000-8000-000000000001',
  true
);

select is(
  (
    select array_agg(summary.workspace_id order by summary.workspace_id)::text
    from public.list_workspace_attention() as summary
  ),
  '{29000000-0000-4000-8000-000000000001,29000000-0000-4000-8000-000000000002}'::text,
  'only the caller''s own workspaces are summarized'::text
);
select is(
  (
    select summary.has_attention
    from public.list_workspace_attention() as summary
    where summary.workspace_id = '29000000-0000-4000-8000-000000000001'
  ),
  true,
  'an unacknowledged mention in a participant Room raises attention'::text
);
select is(
  (
    select summary.has_attention
    from public.list_workspace_attention() as summary
    where summary.workspace_id = '29000000-0000-4000-8000-000000000002'
  ),
  false,
  'administering a workspace does not surface attention from a Room the caller is not in'::text
);

update public.mentions
  set acknowledged_at = now()
  where id = '59000000-0000-4000-8000-000000000001';

select is(
  (
    select summary.has_attention
    from public.list_workspace_attention() as summary
    where summary.workspace_id = '29000000-0000-4000-8000-000000000001'
  ),
  false,
  'acknowledging their own mention clears the workspace attention, though a co-participant''s mention in that Room is still unacknowledged'::text
);

select set_config(
  'request.jwt.claim.sub',
  '19000000-0000-4000-8000-000000000003',
  true
);

select is(
  (
    select array_agg(
      summary.workspace_id::text || ':' || summary.has_attention::text
      order by summary.workspace_id
    )::text
    from public.list_workspace_attention() as summary
  ),
  '{29000000-0000-4000-8000-000000000003:true}'::text,
  'another member sees attention only for the workspace they belong to'::text
);

select * from finish();
rollback;
