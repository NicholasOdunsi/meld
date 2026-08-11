begin;
select plan(16);

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

select * from finish();
rollback;
