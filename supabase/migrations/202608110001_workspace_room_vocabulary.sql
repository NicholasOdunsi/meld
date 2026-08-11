alter table public.organizations rename to workspaces;
alter table public.products rename to projects;
alter table public.discovery_rooms rename to rooms;

alter table public.memberships rename column organization_id to workspace_id;
alter table public.projects rename column organization_id to workspace_id;
alter table public.invitations rename column organization_id to workspace_id;
alter table public.invitations rename column organization_name to workspace_name;
alter table public.rooms rename column organization_id to workspace_id;
alter table public.ai_tasks rename column organization_id to workspace_id;
alter table public.prds rename column organization_id to workspace_id;
alter table public.prd_proposals rename column organization_id to workspace_id;
alter table public.prd_assist_requests rename column organization_id to workspace_id;
alter table public.user_flow_generations rename column organization_id to workspace_id;

alter function public.is_org_member(uuid) rename to is_workspace_member;
alter function public.is_org_admin(uuid) rename to is_workspace_admin;
alter function public.add_organization_creator_membership()
  rename to add_workspace_creator_membership;
alter function public.protect_discovery_room_identity()
  rename to protect_room_identity;
alter function public.room_user_is_org_member(uuid, uuid)
  rename to room_user_is_workspace_member;
alter function public.post_discovery_message(uuid, uuid, text, uuid[], uuid[])
  rename to post_room_message;
alter function public.link_staged_discovery_attachments(uuid, uuid, uuid[], text)
  rename to link_staged_room_attachments;

-- PostgREST binds RPC arguments by name. Recreate the affected RPCs from
-- their installed definitions so existing behavior stays intact while their
-- public names, arguments, table references, and JSON keys become final.
do $vocabulary$
declare
  target record;
  rewritten_definition text;
  legacy_name text;
begin
  for target in
    select
      procedure.oid,
      procedure.proname as old_name,
      case procedure.proname
        when 'create_discovery_room' then 'create_room'
        when 'create_organization_with_product' then 'create_workspace_with_project'
        when 'list_organization_members' then 'list_workspace_members'
        else procedure.proname
      end as new_name,
      oidvectortypes(procedure.proargtypes) as argument_types,
      pg_get_functiondef(procedure.oid) as definition
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.proname in (
        'authorize_invitation_delivery',
        'create_discovery_room',
        'create_invitation',
        'create_organization_with_product',
        'list_organization_members',
        'mark_invitation_delivery',
        'revoke_invitation'
      )
    order by procedure.proname
  loop
    legacy_name := '__vocabulary_legacy_' || target.old_name;
    execute format(
      'alter function public.%I(%s) rename to %I',
      target.old_name,
      target.argument_types,
      legacy_name
    );

    rewritten_definition := replace(
      target.definition,
      'FUNCTION public.' || target.old_name || '(',
      'FUNCTION public.' || target.new_name || '('
    );
    rewritten_definition := replace(rewritten_definition, 'discovery_rooms', 'rooms');
    rewritten_definition := replace(rewritten_definition, 'create_discovery_room', 'create_room');
    rewritten_definition := replace(rewritten_definition, 'list_organization_members', 'list_workspace_members');
    rewritten_definition := replace(rewritten_definition, 'create_organization_with_product', 'create_workspace_with_project');
    rewritten_definition := replace(rewritten_definition, 'is_org_member', 'is_workspace_member');
    rewritten_definition := replace(rewritten_definition, 'is_org_admin', 'is_workspace_admin');
    rewritten_definition := replace(rewritten_definition, 'created_product', 'created_project');
    rewritten_definition := replace(rewritten_definition, 'public.products', 'public.projects');
    rewritten_definition := replace(rewritten_definition, 'product_id', 'project_id');
    rewritten_definition := replace(rewritten_definition, 'product_name', 'project_name');
    rewritten_definition := replace(rewritten_definition, 'organizations', 'workspaces');
    rewritten_definition := replace(rewritten_definition, 'Organizations', 'Workspaces');
    rewritten_definition := replace(rewritten_definition, 'organization', 'workspace');
    rewritten_definition := replace(rewritten_definition, 'Organization', 'Workspace');

    execute rewritten_definition;
    execute format(
      'drop function public.%I(%s)',
      legacy_name,
      target.argument_types
    );
  end loop;
end
$vocabulary$;

-- PL/pgSQL bodies are stored as source text, so table and column renames do
-- not update their unqualified references. Refresh every remaining function
-- in place after applying the same vocabulary dictionary.
do $vocabulary$
declare
  target record;
  rewritten_definition text;
begin
  for target in
    select procedure.oid, pg_get_functiondef(procedure.oid) as definition
    from pg_proc as procedure
    join pg_namespace as namespace
      on namespace.oid = procedure.pronamespace
    where namespace.nspname = 'public'
      and procedure.prokind = 'f'
    order by procedure.oid
  loop
    rewritten_definition := target.definition;
    rewritten_definition := replace(rewritten_definition, 'discovery_rooms', 'rooms');
    rewritten_definition := replace(rewritten_definition, 'post_discovery_message', 'post_room_message');
    rewritten_definition := replace(rewritten_definition, 'link_staged_discovery_attachments', 'link_staged_room_attachments');
    rewritten_definition := replace(rewritten_definition, 'protect_discovery_room_identity', 'protect_room_identity');
    rewritten_definition := replace(rewritten_definition, 'room_user_is_org_member', 'room_user_is_workspace_member');
    rewritten_definition := replace(rewritten_definition, 'add_organization_creator_membership', 'add_workspace_creator_membership');
    rewritten_definition := replace(rewritten_definition, 'is_org_member', 'is_workspace_member');
    rewritten_definition := replace(rewritten_definition, 'is_org_admin', 'is_workspace_admin');
    rewritten_definition := replace(rewritten_definition, 'public.products', 'public.projects');
    rewritten_definition := replace(rewritten_definition, 'organizations', 'workspaces');
    rewritten_definition := replace(rewritten_definition, 'Organizations', 'Workspaces');
    rewritten_definition := replace(rewritten_definition, 'organization', 'workspace');
    rewritten_definition := replace(rewritten_definition, 'Organization', 'Workspace');
    rewritten_definition := replace(rewritten_definition, 'Discovery Room', 'Room');

    if rewritten_definition is distinct from target.definition then
      execute rewritten_definition;
    end if;
  end loop;
end
$vocabulary$;

revoke all on function public.create_workspace_with_project(text, text, text)
  from public;
revoke all on function public.create_room(uuid, text) from public;
revoke all on function public.list_workspace_members(uuid) from public;
revoke all on function public.create_invitation(uuid, text, uuid, text, text, text)
  from public;
revoke all on function public.authorize_invitation_delivery(uuid, uuid, text)
  from public;
revoke all on function public.mark_invitation_delivery(
  uuid, uuid, public.invitation_delivery_status, text
) from public;
revoke all on function public.revoke_invitation(uuid, uuid) from public;

grant execute on function public.create_workspace_with_project(text, text, text)
  to authenticated;
grant execute on function public.create_room(uuid, text) to authenticated;
grant execute on function public.list_workspace_members(uuid) to authenticated;
grant execute on function public.create_invitation(uuid, text, uuid, text, text, text)
  to authenticated;
grant execute on function public.authorize_invitation_delivery(uuid, uuid, text)
  to authenticated;
grant execute on function public.mark_invitation_delivery(
  uuid, uuid, public.invitation_delivery_status, text
) to authenticated;
grant execute on function public.revoke_invitation(uuid, uuid) to authenticated;

alter table public.workspaces
  rename constraint organizations_pkey to workspaces_pkey;
alter table public.workspaces
  rename constraint organizations_created_by_fkey to workspaces_created_by_fkey;
alter table public.workspaces
  rename constraint organizations_name_check to workspaces_name_check;
alter table public.workspaces
  rename constraint organizations_logo_path_check to workspaces_logo_path_check;
alter table public.projects
  rename constraint products_pkey to projects_pkey;
alter table public.projects
  rename constraint products_organization_id_fkey to projects_workspace_id_fkey;
alter table public.projects
  rename constraint products_name_check to projects_name_check;
alter table public.memberships
  rename constraint memberships_organization_id_fkey to memberships_workspace_id_fkey;
alter table public.invitations
  rename constraint invitations_organization_id_fkey to invitations_workspace_id_fkey;
alter table public.invitations
  rename constraint invitations_organization_name_check to invitations_workspace_name_check;
alter table public.rooms
  rename constraint discovery_rooms_pkey to rooms_pkey;
alter table public.rooms
  rename constraint discovery_rooms_organization_id_fkey to rooms_workspace_id_fkey;
alter table public.rooms
  rename constraint discovery_rooms_owner_id_fkey to rooms_owner_id_fkey;
alter table public.rooms
  rename constraint discovery_rooms_name_check to rooms_name_check;
alter table public.rooms
  rename constraint discovery_rooms_id_organization_id_key to rooms_id_workspace_id_key;
alter table public.ai_tasks
  rename constraint ai_tasks_organization_id_fkey to ai_tasks_workspace_id_fkey;
alter table public.ai_tasks
  rename constraint ai_tasks_room_id_organization_id_fkey to ai_tasks_room_id_workspace_id_fkey;
alter table public.prds
  rename constraint prds_organization_id_fkey to prds_workspace_id_fkey;
alter table public.prds
  rename constraint prds_room_id_organization_id_fkey to prds_room_id_workspace_id_fkey;
alter table public.prd_proposals
  rename constraint prd_proposals_room_id_organization_id_fkey to prd_proposals_room_id_workspace_id_fkey;
alter table public.prd_assist_requests
  rename constraint prd_assist_requests_room_id_organization_id_fkey to prd_assist_requests_room_id_workspace_id_fkey;
alter table public.user_flow_generations
  rename constraint user_flow_generations_organization_id_fkey to user_flow_generations_workspace_id_fkey;
alter table public.user_flow_generations
  rename constraint user_flow_generations_room_id_organization_id_fkey to user_flow_generations_room_id_workspace_id_fkey;

alter index public.products_organization_id_idx
  rename to projects_workspace_id_idx;
alter index public.invitations_active_organization_email_idx
  rename to invitations_active_workspace_email_idx;
alter index public.invitations_organization_id_idx
  rename to invitations_workspace_id_idx;
alter index public.discovery_rooms_organization_id_idx
  rename to rooms_workspace_id_idx;

alter trigger add_organization_creator_membership on public.workspaces
  rename to add_workspace_creator_membership;
alter trigger protect_discovery_room_identity on public.rooms
  rename to protect_room_identity;

alter policy "Members can view their organizations" on public.workspaces
  rename to "Members can view their workspaces";
alter policy "Authenticated users can create organizations" on public.workspaces
  rename to "Authenticated users can create workspaces";
alter policy "Admins can update their organizations" on public.workspaces
  rename to "Admins can update their workspaces";
alter policy "Members can view organization memberships" on public.memberships
  rename to "Members can view workspace memberships";
alter policy "Admins can add organization memberships" on public.memberships
  rename to "Admins can add workspace memberships";
alter policy "Admins can update organization memberships" on public.memberships
  rename to "Admins can update workspace memberships";
alter policy "Admins can delete organization memberships" on public.memberships
  rename to "Admins can delete workspace memberships";
alter policy "Members can view organization products" on public.projects
  rename to "Members can view workspace projects";
alter policy "Admins can create organization products" on public.projects
  rename to "Admins can create workspace projects";
alter policy "Admins can update organization products" on public.projects
  rename to "Admins can update workspace projects";
alter policy "Admins can delete organization products" on public.projects
  rename to "Admins can delete workspace projects";
alter policy "Admins can view organization invitations" on public.invitations
  rename to "Admins can view workspace invitations";
alter policy "Editors can add organization room participants" on public.room_participants
  rename to "Editors can add workspace room participants";
