begin;
select plan(12);

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

select * from finish();
rollback;
