begin;
select plan(21);

select has_table('public'::name, 'workspaces'::name);
select has_table('public'::name, 'projects'::name);
select has_table('public'::name, 'rooms'::name);
select hasnt_table('public'::name, 'organizations'::name);
select hasnt_table('public'::name, 'products'::name);
select hasnt_table('public'::name, 'discovery_rooms'::name);
select has_column(
  'public'::name, 'memberships'::name, 'workspace_id'::name,
  'memberships.workspace_id exists'::text
);
select has_column(
  'public'::name, 'rooms'::name, 'workspace_id'::name,
  'rooms.workspace_id exists'::text
);
select has_column(
  'public'::name, 'ai_tasks'::name, 'workspace_id'::name,
  'ai_tasks.workspace_id exists'::text
);
select has_function('public', 'is_workspace_member', array['uuid']);
select has_function('public', 'is_workspace_admin', array['uuid']);
select has_function('public'::name, 'create_room'::name);

select is(
  (
    select count(*)::integer
    from pg_policies as policy
    where policy.schemaname = 'realtime'
      and policy.tablename = 'messages'
      and policy.policyname = 'Room participants can receive private room events'
      and policy.cmd = 'SELECT'
      and policy.qual like '%can_access_room_topic(realtime.topic())%'
      and policy.with_check is null
  ),
  1,
  'the receive policy checks access to the room topic'
);

select is(
  (
    select count(*)::integer
    from pg_policies as policy
    where policy.schemaname = 'realtime'
      and policy.tablename = 'messages'
      and policy.policyname = 'Room participants can send private room events'
      and policy.cmd = 'INSERT'
      and policy.qual is null
      and policy.with_check like '%can_access_room_topic(realtime.topic())%'
  ),
  1,
  'the send policy checks access to the room topic'
);

select is(
  (
    select count(*)::integer
    from pg_proc as function_record
    join pg_namespace as function_schema
      on function_schema.oid = function_record.pronamespace
    where function_schema.nspname = 'public'
      and function_record.proname in (
        'is_workspace_member',
        'is_workspace_admin'
      )
      and function_record.pronargs = 1
      and function_record.prosecdef
      and function_record.provolatile = 's'
      and function_record.proconfig @> array['search_path=""']
      and pg_get_functiondef(function_record.oid) ilike '%from public.memberships%'
      and pg_get_functiondef(function_record.oid) like '%workspace_id = target_org%'
      and pg_get_functiondef(function_record.oid) not like '%organization_id%'
  ),
  2,
  'workspace membership helpers retain their secured final definitions'
);

select is(
  (
    select count(*)::integer
    from pg_publication_tables as publication
    where publication.pubname = 'supabase_realtime'
      and publication.schemaname = 'public'
      and publication.tablename in ('decisions', 'mentions', 'messages')
  ),
  3,
  'the final Realtime publication includes the required room event tables'
);

select is(
  (
    select array_agg(
      constraint_record.conrelid::regclass::text || ':' ||
      constraint_record.conname || ':' ||
      pg_get_constraintdef(constraint_record.oid)
      order by constraint_record.conname
    )
    from pg_constraint as constraint_record
    where constraint_record.connamespace = 'public'::regnamespace
      and constraint_record.conname in (
        'attachments_message_id_room_id_fkey',
        'decisions_source_message_id_room_id_fkey',
        'evidence_attachment_id_room_id_fkey',
        'evidence_message_id_room_id_fkey',
        'mentions_message_id_room_id_fkey',
        'rooms_id_workspace_id_key'
      )
  ),
  array[
    'attachments:attachments_message_id_room_id_fkey:FOREIGN KEY (message_id, room_id) REFERENCES messages(id, room_id) ON DELETE RESTRICT',
    'decisions:decisions_source_message_id_room_id_fkey:FOREIGN KEY (source_message_id, room_id) REFERENCES messages(id, room_id) ON DELETE RESTRICT',
    'evidence:evidence_attachment_id_room_id_fkey:FOREIGN KEY (attachment_id, room_id) REFERENCES attachments(id, room_id) ON DELETE RESTRICT',
    'evidence:evidence_message_id_room_id_fkey:FOREIGN KEY (message_id, room_id) REFERENCES messages(id, room_id) ON DELETE RESTRICT',
    'mentions:mentions_message_id_room_id_fkey:FOREIGN KEY (message_id, room_id) REFERENCES messages(id, room_id) ON DELETE CASCADE',
    'rooms:rooms_id_workspace_id_key:UNIQUE (id, workspace_id)'
  ],
  'the final room integrity constraints retain their composite keys'
);

select is(
  (
    select array_agg(policy.policyname::text order by policy.policyname)
    from pg_policies as policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname ilike '%logo%'
  ),
  array[
    'Users can delete workspace logos in their folder',
    'Users can update workspace logos in their folder',
    'Users can upload workspace logos in their folder',
    'Workspace logos are publicly readable'
  ],
  'storage logo policies use final Workspace vocabulary'
);

select is(
  (
    select count(*)::integer
    from pg_policies as policy
    where policy.schemaname = 'storage'
      and policy.tablename = 'objects'
      and policy.policyname in (
        'Users can delete workspace logos in their folder',
        'Users can update workspace logos in their folder',
        'Users can upload workspace logos in their folder',
        'Workspace logos are publicly readable'
      )
      and concat(policy.qual, policy.with_check) like '%organization-logos%'
  ),
  4,
  'renamed storage policies preserve the organization-logos bucket id'
);

insert into auth.users (
  id, aud, role, email, encrypted_password, email_confirmed_at,
  raw_app_meta_data, raw_user_meta_data, created_at, updated_at
)
values
  (
    '91000000-0000-4000-8000-000000000001', 'authenticated',
    'authenticated', 'vocabulary-admin@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  ),
  (
    '91000000-0000-4000-8000-000000000002', 'authenticated',
    'authenticated', 'vocabulary-member@example.com', '', now(),
    '{"provider":"email","providers":["email"]}', '{}', now(), now()
  );

insert into public.workspaces (id, name, created_by)
values (
  '92000000-0000-4000-8000-000000000001',
  'Vocabulary test workspace',
  '91000000-0000-4000-8000-000000000001'
);

insert into public.memberships (workspace_id, user_id, role)
values (
  '92000000-0000-4000-8000-000000000001',
  '91000000-0000-4000-8000-000000000002',
  'member'
);

select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000001',
  true
);

select ok(
  public.is_workspace_member('92000000-0000-4000-8000-000000000001')
    and public.is_workspace_admin('92000000-0000-4000-8000-000000000001'),
  'workspace admin satisfies member and admin helpers'
);

select set_config(
  'request.jwt.claim.sub',
  '91000000-0000-4000-8000-000000000002',
  true
);

select ok(
  public.is_workspace_member('92000000-0000-4000-8000-000000000001')
    and not public.is_workspace_admin('92000000-0000-4000-8000-000000000001'),
  'ordinary workspace membership does not grant admin access'
);

select * from finish();
rollback;
