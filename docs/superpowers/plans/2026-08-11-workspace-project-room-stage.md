# Workspace Project Room Stage Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace Discovery and Feature Room conversion with a Workspace -> Project -> Room hierarchy where one Room changes stage, preserves context, and reveals artifact-backed surfaces progressively.

**Architecture:** PostgreSQL remains the authorization and lifecycle authority. Rooms retain a denormalized `workspace_id`, constrained to their Project through a composite foreign key; narrow security-definer functions perform stage changes, Room moves, user-flow starts, and proposal materialization. Next.js renders one stable Room route, while shared pure surface logic, Supabase Realtime, and Astryx navigation keep the header, tabs, and Project accordion synchronized.

**Tech Stack:** Next.js App Router, React 19, TypeScript, Supabase/PostgreSQL with RLS and pgTAP, Vitest, Playwright, Astryx Design System, Boxicons, Zod, pnpm/Turborepo.

## Global Constraints

- Begin only after `origin/setup-workspace-from-file` has merged into the implementation branch.
- Do not rename the current branch.
- Do not rewrite existing Supabase migrations; add forward migrations.
- Do not add a compatibility route or dual-write period.
- Keep the literal storage bucket IDs `organization-logos` and `discovery-attachments`.
- Keep genuine product-domain names including `product_role`, Product Agent, product manager, and PRD.
- Room visibility remains participant-scoped; Workspace administrators do not implicitly gain Room access.
- Domain Tasks and AI-proposed task creation remain out of scope.
- All UI work must start with `pnpm exec astryx build`, followed by the relevant named `astryx template` references and `astryx component` for every component used.
- Use Astryx components and tokens for all layout and styling; use Boxicons for icons.
- Use TDD: add a failing focused test, observe the expected failure, implement minimally, then rerun the focused and affected suites.
- Run Node `22.23.2`, matching the setup branch's `.nvmrc`, for Astryx and repository commands.

---

## Final File Structure

The implementation should converge on these ownership boundaries:

- `packages/contracts/src/rooms.ts` - Room stages, surfaces, and proposed-action contracts shared across processes.
- `apps/web/src/features/rooms/` - Room schemas, repository, server actions, realtime synchronization, and Room UI.
- `apps/web/src/features/projects/` - Project schemas, repository, actions, dialogs, and accordion state.
- `apps/web/src/features/canvas/user-flow-lifecycle.ts` - Supabase lifecycle row for the gateway-backed canvas.
- `apps/web/src/features/rooms/surfaces.ts` - pure surface emergence and URL-resolution logic.
- `apps/web/src/features/rooms/components/decisions-surface.tsx` - deterministic Decisions view.
- `apps/web/src/features/rooms/components/room-overview.tsx` - deterministic Overview view.
- `apps/web/src/ui/workspace-navigation.tsx` - workspace rail, workspace destinations, Project accordion, and Room rows.
- `supabase/migrations/202608110001_workspace_room_vocabulary.sql` - forward vocabulary rename.
- `supabase/migrations/202608110002_projects_rooms.sql` - Project ownership and Project-scoped Rooms.
- `supabase/migrations/202608110003_room_stage.sql` - Room stage, history, authorization, and Realtime.
- `supabase/migrations/202608110004_room_move.sql` - authorized same-Workspace Room moves.
- `supabase/migrations/202608110005_user_flow_lifecycle.sql` - durable User Flow existence and idempotent start.
- `supabase/migrations/202608110006_room_surface_broadcast.sql` - private Room-topic surface invalidation.
- `supabase/migrations/202608110007_room_proposal_contract.sql` - proposal shape and settlement validation.
- `supabase/migrations/202608110008_room_proposal_responses.sql` - proposal responses and idempotent materialization.
- `supabase/migrations/202608110009_workspace_attention.sql` - content-free per-workspace attention summary.
- `supabase/tests/workspace_room_vocabulary.test.sql` - final vocabulary and migration assertions.
- `supabase/tests/projects_rooms_stage.test.sql` - Project, Room, stage, move, and history authorization.
- `supabase/tests/user_flow_lifecycle.test.sql` - User Flow lifecycle authorization and idempotency.
- `supabase/tests/room_surface_broadcast.test.sql` - private Room-topic surface invalidation authorization and delivery.
- `supabase/tests/room_proposals.test.sql` - proposal shape, dismissal, manifest, and concurrency behavior.
- `supabase/tests/workspace_attention.test.sql` - attention isolation and output shape.
- `e2e/room-lifecycle.spec.ts` - cross-surface Room lifecycle journey.
- `e2e/workspace-project-navigation.spec.ts` - workspace attention and Project navigation journey.

Historical design documents remain unchanged. Legacy migration filenames also remain unchanged because the forward migration depends on them.

---

### Task 1: Land the Mechanical Workspace and Room Vocabulary Rename

**Files:**
- Create: `supabase/migrations/202608110001_workspace_room_vocabulary.sql`
- Create: `supabase/tests/workspace_room_vocabulary.test.sql`
- Move: `apps/web/src/features/discovery/` -> `apps/web/src/features/rooms/`
- Move: `apps/web/src/app/(app)/[organizationId]/` -> `apps/web/src/app/(app)/[workspaceId]/`
- Move: `apps/web/src/app/(app)/[workspaceId]/discovery/[roomId]/` -> `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/`
- Move: `apps/web/src/ui/dashboard-navigation.tsx` -> `apps/web/src/ui/workspace-navigation.tsx`
- Move: `apps/web/src/ui/dashboard-navigation.test.tsx` -> `apps/web/src/ui/workspace-navigation.test.tsx`
- Move: `apps/web/src/features/home/components/create-room-dialog.tsx` -> `apps/web/src/features/rooms/components/create-room-dialog.tsx`
- Move: `apps/web/src/features/home/components/create-room-dialog.test.tsx` -> `apps/web/src/features/rooms/components/create-room-dialog.test.tsx`
- Move: `e2e/discovery-room.spec.ts` -> `e2e/room.spec.ts`
- Move: `scripts/check-discovery-sql.mjs` -> `scripts/check-room-sql.mjs`
- Modify: `apps/web/src/**`
- Modify: `apps/connector/src/**`
- Modify: `apps/gateway/src/**`
- Modify: `packages/contracts/src/**`
- Modify: `supabase/tests/**`
- Modify: `scripts/check-room-sql.mjs`
- Modify: `package.json`

**Interfaces:**
- Consumes: schema and application state from the merged setup branch.
- Produces: final Workspace/Project/Room identifiers and canonical `/{workspaceId}/rooms/{roomId}` URLs, with no behavioral change.

- [ ] **Step 1: Write the failing final-vocabulary pgTAP test**

Create `supabase/tests/workspace_room_vocabulary.test.sql` with assertions for the final tables, columns, and helper names:

```sql
begin;
select plan(12);

select has_table('public', 'workspaces');
select has_table('public', 'projects');
select has_table('public', 'rooms');
select hasnt_table('public', 'organizations');
select hasnt_table('public', 'products');
select hasnt_table('public', 'discovery_rooms');
select has_column('public', 'memberships', 'workspace_id');
select has_column('public', 'rooms', 'workspace_id');
select has_column('public', 'ai_tasks', 'workspace_id');
select has_function('public', 'is_workspace_member', array['uuid']);
select has_function('public', 'is_workspace_admin', array['uuid']);
select has_function('public', 'create_room');

select * from finish();
rollback;
```

- [ ] **Step 2: Run the pgTAP test and observe the vocabulary failure**

Run:

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 22.23.2
supabase test db supabase/tests/workspace_room_vocabulary.test.sql
```

Expected: FAIL because `workspaces`, `projects`, and `rooms` do not exist yet.

- [ ] **Step 3: Add the forward database rename**

Start `202608110001_workspace_room_vocabulary.sql` with dependency-preserving table and column renames:

```sql
alter table public.organizations rename to workspaces;
alter table public.products rename to projects;
alter table public.discovery_rooms rename to rooms;

alter table public.memberships rename column organization_id to workspace_id;
alter table public.projects rename column organization_id to workspace_id;
alter table public.invitations rename column organization_id to workspace_id;
alter table public.rooms rename column organization_id to workspace_id;
alter table public.ai_tasks rename column organization_id to workspace_id;
alter table public.prds rename column organization_id to workspace_id;
alter table public.prd_proposals rename column organization_id to workspace_id;
alter table public.prd_assist_requests rename column organization_id to workspace_id;
alter table public.user_flow_generations rename column organization_id to workspace_id;

alter function public.is_org_member(uuid) rename to is_workspace_member;
alter function public.is_org_admin(uuid) rename to is_workspace_admin;
alter function public.create_discovery_room(uuid, text) rename to create_room;
alter function public.list_organization_members(uuid) rename to list_workspace_members;
alter function public.add_organization_creator_membership()
  rename to add_workspace_creator_membership;
alter function public.protect_discovery_room_identity()
  rename to protect_room_identity;
```

Rename constraints, indexes, triggers, and policies where their identifiers contain the superseded entity names. Keep the two storage bucket string literals unchanged. Recreate RPCs whose named PostgREST arguments or JSON response keys use `organization`, using `target_workspace_id` and `workspace_id` in their final signatures and payloads.

- [ ] **Step 4: Perform the application and route rename with an explicit dictionary**

Use `git mv` for directories and files, then apply these case-sensitive replacements only in application code and tests:

```text
organizationId -> workspaceId
organization_id -> workspace_id
OrganizationLayout -> WorkspaceLayout
OrganizationLogoIcon -> WorkspaceLogoIcon
DiscoveryRoom -> Room
discoveryRoom -> room
discovery_rooms -> rooms
createDiscoveryRoom -> createRoom
listDiscoveryRooms -> listRooms
getDiscoveryRoomPageData -> getRoomPageData
DashboardNavigation -> WorkspaceNavigation
isOrgMember -> isWorkspaceMember
isOrgAdmin -> isWorkspaceAdmin
```

Do not replace `product_role`, Product Agent, `organization-logos`, or `discovery-attachments`. Change navigation and action URLs from `/${workspaceId}/discovery/${roomId}` to `/${workspaceId}/rooms/${roomId}`.

- [ ] **Step 5: Update the SQL and repository convention checks**

Rename `check:sql-discovery` to `check:sql-rooms` and update `test:sql` to call the new name. Make `scripts/check-room-sql.mjs` parse the legacy migration files plus all `2026081100*.sql` forward migrations, and assert the final Realtime and room-integrity fragments from the new migration rather than expecting final names in historical files.

- [ ] **Step 6: Run the focused vocabulary verification**

Run:

```bash
pnpm check:sql-arities
pnpm check:sql-rooms
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web test
supabase test db supabase/tests/workspace_room_vocabulary.test.sql
```

Expected: all commands PASS.

- [ ] **Step 7: Scan for accidental legacy vocabulary**

Run:

```bash
git grep -nE 'organizationId|organization_id|organizations|discovery_rooms|DiscoveryRoom|discoveryRoom' -- apps packages e2e scripts supabase/tests
```

Expected: only deliberate literal bucket references or migration-compatibility assertions remain. Inspect every match; do not blanket-replace genuine product-domain language.

- [ ] **Step 8: Commit the mechanical rename**

```bash
git add apps packages e2e scripts supabase package.json
git commit -m "refactor: align workspace project room vocabulary"
```

---

### Task 2: Add Projects and Project-Scoped Room Creation

**Files:**
- Create: `supabase/migrations/202608110002_projects_rooms.sql`
- Create: `supabase/tests/projects_rooms_stage.test.sql`
- Create: `apps/web/src/features/projects/schemas.ts`
- Create: `apps/web/src/features/projects/repository.ts`
- Create: `apps/web/src/features/projects/repository.test.ts`
- Create: `apps/web/src/features/projects/actions.ts`
- Create: `apps/web/src/features/projects/actions.test.ts`
- Modify: `apps/web/src/features/rooms/actions.ts`
- Modify: `apps/web/src/features/rooms/actions.test.ts`
- Modify: `apps/web/src/features/rooms/repository.ts`
- Modify: `apps/web/src/features/rooms/schemas.ts`
- Modify: `apps/web/src/features/workspaces/supabase-backend.ts`

**Interfaces:**
- Consumes: renamed `workspaces`, `projects`, and `rooms` from Task 1.
- Produces: `ProjectSummary`, `RoomSummary.projectId`, `listWorkspaceProjects`, `createProject`, `renameProject`, `deleteProject`, and Project-scoped `createRoomWithParticipants`.

- [ ] **Step 1: Add failing pgTAP cases for Project structure and authorization**

Cover these exact behaviors in `projects_rooms_stage.test.sql`: `projects.created_by` is populated, `(id, workspace_id)` is unique, every Room has a non-null `project_id`, cross-workspace Project/Room pairs fail, members can read Project names, only admins can mutate Projects, `projects.workspace_id` and `created_by` cannot be updated, and deleting a Project containing Rooms fails with foreign-key violation.

Use a cross-workspace insert assertion such as:

```sql
select throws_ok(
  $$insert into public.rooms (
      workspace_id, project_id, name, owner_id
    ) values (
      '30000000-0000-4000-8000-000000000003',
      '70000000-0000-4000-8000-000000000007',
      'Wrong workspace',
      '10000000-0000-4000-8000-000000000001'
    )$$,
  '23503',
  null,
  'room project must belong to the room workspace'
);
```

- [ ] **Step 2: Run the Project pgTAP test and observe failure**

```bash
supabase test db supabase/tests/projects_rooms_stage.test.sql
```

Expected: FAIL because `projects.created_by` and `rooms.project_id` do not exist.

- [ ] **Step 3: Implement the Project and Room structural migration**

In `202608110002_projects_rooms.sql`:

```sql
alter table public.projects add column created_by uuid references auth.users(id);
update public.projects as project
set created_by = workspace.created_by
from public.workspaces as workspace
where workspace.id = project.workspace_id;
alter table public.projects alter column created_by set not null;
alter table public.projects add constraint projects_id_workspace_key
  unique (id, workspace_id);

alter table public.rooms add column project_id uuid;

do $$
begin
  if exists (
    select 1
    from public.workspaces as workspace
    left join public.projects as project
      on project.workspace_id = workspace.id
    group by workspace.id
    having count(project.id) <> 1
  ) then
    raise exception 'Each legacy workspace must have exactly one project';
  end if;
end;
$$;

update public.rooms as room
set project_id = project.id
from public.projects as project
where project.workspace_id = room.workspace_id;

alter table public.rooms alter column project_id set not null;
alter table public.rooms add constraint rooms_project_workspace_fk
  foreign key (project_id, workspace_id)
  references public.projects (id, workspace_id)
  on delete restrict;
```

Add Project RLS using `is_workspace_member` for reads and `is_workspace_admin` for inserts, name updates, and deletes. Revoke broad authenticated Project update privilege and grant `update(name)` only; the insert policy requires `created_by = auth.uid()`. Update `create_workspace_with_project` to set `projects.created_by`. Replace `create_room` with the final `(target_workspace_id uuid, target_project_id uuid, room_name text)` signature and validate both workspace membership and Project ownership.

- [ ] **Step 4: Write failing repository and action tests**

Assert the final mapped shapes:

```ts
expect(await listWorkspaceProjects(WORKSPACE_ID)).toEqual([
  {
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Mobile onboarding",
    createdBy: OWNER_ID,
  },
]);

expect(createRoomRpc).toHaveBeenCalledWith("create_room", {
  target_workspace_id: WORKSPACE_ID,
  target_project_id: PROJECT_ID,
  room_name: "Activation research",
});
```

- [ ] **Step 5: Implement Project schemas, repository, and actions**

Define:

```ts
export type ProjectSummary = {
  id: string;
  workspaceId: string;
  name: string;
  createdBy: string;
};

export type RoomSummary = {
  id: string;
  workspaceId: string;
  projectId: string;
  name: string;
  ownerId: string;
};
```

Project actions must validate UUIDs and trimmed 1-120 character names, use the authenticated Supabase client, and return stable user-facing errors. After success, call the layout form of `revalidatePath` with the path `` `/${workspaceId}` ``. Extend Room creation input with required `projectId` and return the stable `/${workspaceId}/rooms/${roomId}` destination.

- [ ] **Step 6: Run Project and Room service tests**

```bash
pnpm --filter @meld/web test -- src/features/projects src/features/rooms/actions.test.ts src/features/rooms/repository.test.ts
supabase test db supabase/tests/projects_rooms_stage.test.sql
pnpm --filter @meld/web typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit the Project data slice**

```bash
git add supabase/migrations/202608110002_projects_rooms.sql supabase/tests/projects_rooms_stage.test.sql apps/web/src/features/projects apps/web/src/features/rooms apps/web/src/features/workspaces
git commit -m "feat: add projects and project-scoped rooms"
```

---

### Task 3: Build Project and Room Creation UI

**Files:**
- Create: `apps/web/src/features/projects/components/create-project-dialog.tsx`
- Create: `apps/web/src/features/projects/components/create-project-dialog.test.tsx`
- Create: `apps/web/src/features/projects/components/rename-project-dialog.tsx`
- Create: `apps/web/src/features/projects/components/rename-project-dialog.test.tsx`
- Create: `apps/web/src/features/projects/components/delete-project-dialog.tsx`
- Create: `apps/web/src/features/projects/components/delete-project-dialog.test.tsx`
- Create: `apps/web/src/features/projects/components/project-room-navigation.tsx`
- Create: `apps/web/src/features/projects/components/project-room-navigation.test.tsx`
- Modify: `apps/web/src/features/rooms/components/create-room-dialog.tsx`
- Modify: `apps/web/src/features/rooms/components/create-room-dialog.test.tsx`
- Modify: `apps/web/src/app/(app)/[workspaceId]/layout.tsx`
- Modify: `apps/web/src/ui/workspace-navigation.tsx`
- Modify: `apps/web/src/ui/workspace-navigation.test.tsx`

**Interfaces:**
- Consumes: Project and Room actions from Task 2.
- Produces: `ProjectRoomNavigation`, `resolveOpenProjectId`, and complete Project and Room creation workflows.

- [ ] **Step 1: Discover the Astryx navigation and dialog APIs**

```bash
pnpm exec astryx build "workspace project accordion room navigation create rename delete project"
pnpm exec astryx template shell-side-nav
pnpm exec astryx component SideNav
pnpm exec astryx component Collapsible
pnpm exec astryx component CollapsibleGroup
pnpm exec astryx component Dialog
pnpm exec astryx component IconButton
pnpm exec astryx component DropdownMenu
```

Record the exact `CollapsibleGroup` controlled-state props in the task notes before writing JSX.

- [ ] **Step 2: Write failing pure-state and interaction tests**

Add table cases for:

```ts
expect(resolveOpenProjectId({
  routeProjectId: PROJECT_B,
  storedProjectId: PROJECT_A,
  projectIds: [PROJECT_A, PROJECT_B],
})).toBe(PROJECT_B);

expect(resolveOpenProjectId({
  routeProjectId: null,
  storedProjectId: "deleted-project",
  projectIds: [PROJECT_A, PROJECT_B],
})).toBe(PROJECT_A);
```

Component tests must verify one open Project, active Room Project synchronization, admin-only Create/Rename/Delete Project controls, Add Room bound to the expanded Project, no navigation link on Project disclosure triggers, Create Workspace pinned at the bottom of the rail, tooltips and accessible labels for icon buttons, and a scrollable navigation region. Deleting a non-empty Project must keep the dialog open and show the stable restriction error.

- [ ] **Step 3: Run the tests and observe failure**

```bash
pnpm --filter @meld/web test -- src/features/projects/components src/ui/workspace-navigation.test.tsx
```

Expected: FAIL because the Project navigation components do not exist.

- [ ] **Step 4: Implement controlled Project navigation**

Keep state logic pure and storage workspace-specific:

```ts
export function projectStorageKey(workspaceId: string) {
  return `meld:workspace:${workspaceId}:open-project`;
}

export function resolveOpenProjectId(input: {
  routeProjectId: string | null;
  storedProjectId: string | null;
  projectIds: string[];
}) {
  if (input.routeProjectId && input.projectIds.includes(input.routeProjectId)) {
    return input.routeProjectId;
  }
  if (input.storedProjectId && input.projectIds.includes(input.storedProjectId)) {
    return input.storedProjectId;
  }
  return input.projectIds[0] ?? null;
}
```

Render Projects with Astryx disclosure components and Rooms as edge-to-edge `SideNavItem` rows. Do not Card-wrap Projects or Rooms. Use `Plus` for creation and `DotsHorizontalRounded` for Room overflow.

- [ ] **Step 5: Implement the creation dialogs and wire navigation refresh**

Create and Rename Project validate names and close only after success. Delete Project uses a confirmation dialog and leaves Room deletion as a separate explicit workflow. Add Room receives `projectId` from its trigger and does not render a Project picker. Successful actions refresh the Workspace layout; Room creation navigates to the stable Room URL.

- [ ] **Step 6: Run focused UI and Astryx checks**

```bash
pnpm --filter @meld/web test -- src/features/projects/components src/features/rooms/components/create-room-dialog.test.tsx src/ui/workspace-navigation.test.tsx
pnpm check:astryx
pnpm --filter @meld/web typecheck
```

Expected: all commands PASS.

- [ ] **Step 7: Commit Project navigation**

```bash
git add apps/web/src/features/projects/components apps/web/src/features/rooms/components/create-room-dialog.tsx apps/web/src/features/rooms/components/create-room-dialog.test.tsx apps/web/src/app/'(app)'/'[workspaceId]'/layout.tsx apps/web/src/ui/workspace-navigation.tsx apps/web/src/ui/workspace-navigation.test.tsx
git commit -m "feat: navigate projects and project rooms"
```

---

### Task 4: Add Audited Room Stage Transitions

**Files:**
- Create: `supabase/migrations/202608110003_room_stage.sql`
- Modify: `supabase/tests/projects_rooms_stage.test.sql`
- Create: `packages/contracts/src/rooms.ts`
- Create: `packages/contracts/src/rooms.test.ts`
- Modify: `packages/contracts/src/index.ts`
- Create: `apps/web/src/features/rooms/stage.ts`
- Create: `apps/web/src/features/rooms/stage.test.ts`
- Create: `apps/web/src/features/rooms/components/room-stage-selector.tsx`
- Create: `apps/web/src/features/rooms/components/room-stage-selector.test.tsx`
- Create: `apps/web/src/features/rooms/use-room-lifecycle-realtime.ts`
- Create: `apps/web/src/features/rooms/use-room-lifecycle-realtime.test.tsx`
- Modify: `apps/web/src/features/rooms/schemas.ts`
- Modify: `apps/web/src/features/rooms/repository.ts`
- Modify: `apps/web/src/features/rooms/repository.test.ts`
- Modify: `apps/web/src/features/rooms/components/room-header.tsx`
- Modify: `apps/web/src/ui/workspace-navigation.tsx`
- Modify: `scripts/check-contract-enum-parity.mjs`

**Interfaces:**
- Consumes: final Room rows and Project navigation.
- Produces: `RoomStageSchema`, `setRoomStage`, `getRoomStagePresentation`, `RoomStageSelector`, stage-event history, and Room lifecycle Realtime synchronization.

- [ ] **Step 1: Add failing contract and pgTAP tests**

Define the expected contract test:

```ts
expect(RoomStageSchema.options).toEqual([
  "discovery",
  "define",
  "design",
  "development",
]);
```

pgTAP must prove owner success, participating admin success, editor rejection, nonparticipant admin rejection, backward transition success, exact `from_stage`/`to_stage`/`changed_by`, same-stage no-op, and direct authenticated update rejection.

- [ ] **Step 2: Run tests and observe failure**

```bash
pnpm --filter @meld/contracts test -- rooms.test.ts
supabase test db supabase/tests/projects_rooms_stage.test.sql
```

Expected: FAIL because Room stages and `set_room_stage` do not exist.

- [ ] **Step 3: Implement the enum, event table, grants, and transition RPC**

Add to `202608110003_room_stage.sql`:

```sql
create type public.room_stage
  as enum ('discovery', 'define', 'design', 'development');

alter table public.rooms
  add column stage public.room_stage not null default 'discovery';

create table public.room_stage_events (
  id uuid primary key default gen_random_uuid(),
  room_id uuid not null references public.rooms(id) on delete cascade,
  from_stage public.room_stage not null,
  to_stage public.room_stage not null,
  changed_by uuid not null references auth.users(id),
  created_at timestamptz not null default now(),
  check (from_stage <> to_stage)
);
```

Implement `set_room_stage(target_room_id uuid, target_stage room_stage)` with `FOR UPDATE`, participant plus owner/admin authorization, same-stage early return, atomic Room update, and event insert. Enable RLS on `room_stage_events`, grant participant reads, and grant no direct authenticated inserts, updates, or deletes. Revoke broad Room update privilege, grant only `update(name)` to authenticated, and grant execute only on the lifecycle RPCs. Add `rooms` and `room_stage_events` to `supabase_realtime`.

- [ ] **Step 4: Implement TypeScript stage contracts and presentation**

```ts
export const RoomStageSchema = z.enum([
  "discovery",
  "define",
  "design",
  "development",
]);

export const ROOM_STAGE_PRESENTATION = {
  discovery: { label: "Discovery", icon: Search },
  define: { label: "Define", icon: Target },
  design: { label: "Design", icon: Palette },
  development: { label: "Development", icon: Spanner },
} as const;
```

Add `room_stage` to contract-enum parity and extend `RoomSummary` plus Room row mapping with `stage: RoomStageSchema`.

- [ ] **Step 5: Discover and implement the stage selector**

```bash
pnpm exec astryx build "compact room stage status selector in a work app header"
pnpm exec astryx template SelectorOptionBasic
pnpm exec astryx component Selector
pnpm exec astryx component Toast
```

The selector must render only for authorized users, optimistically select, use the committed RPC return as authority, restore the previous value on failure, and announce failure through `useToast()`.

- [ ] **Step 6: Implement lifecycle Realtime reconciliation**

Subscribe by Room ID in the header and by Workspace ID in navigation. On `UPDATE`, parse the complete row with Zod and replace stage/project state. On channel reconnect, call `router.refresh()` once before accepting more events. Do not infer stage from events when the current Room row is available.

- [ ] **Step 7: Run focused checks**

```bash
pnpm --filter @meld/contracts test -- rooms.test.ts
pnpm --filter @meld/web test -- src/features/rooms/stage.test.ts src/features/rooms/components/room-stage-selector.test.tsx src/features/rooms/use-room-lifecycle-realtime.test.tsx
pnpm check:contract-enums
supabase test db supabase/tests/projects_rooms_stage.test.sql
pnpm check:astryx
```

Expected: all commands PASS.

- [ ] **Step 8: Commit audited stages**

```bash
git add packages/contracts apps/web/src/features/rooms apps/web/src/ui/workspace-navigation.tsx scripts/check-contract-enum-parity.mjs supabase/migrations/202608110003_room_stage.sql supabase/tests/projects_rooms_stage.test.sql
git commit -m "feat: add audited room stage transitions"
```

---

### Task 5: Add Authorized Room Moves

**Files:**
- Create: `supabase/migrations/202608110004_room_move.sql`
- Modify: `supabase/tests/projects_rooms_stage.test.sql`
- Modify: `apps/web/src/features/rooms/actions.ts`
- Modify: `apps/web/src/features/rooms/actions.test.ts`
- Create: `apps/web/src/features/projects/components/move-room-dialog.tsx`
- Create: `apps/web/src/features/projects/components/move-room-dialog.test.tsx`
- Modify: `apps/web/src/ui/workspace-navigation.tsx`
- Modify: `apps/web/src/ui/workspace-navigation.test.tsx`

**Interfaces:**
- Consumes: composite Project/Room key and Project navigation from Tasks 2-4.
- Produces: `move_room(target_room_id, target_project_id) -> uuid` and `moveRoom({workspaceId, roomId, projectId})`.

- [ ] **Step 1: Add failing authorization and consistency tests**

Prove Room owner and participating admin success, editor and nonparticipant admin rejection, cross-workspace rejection, same-Project no-op, unchanged Room URL, and `updated_at` movement only on a real move.

- [ ] **Step 2: Run focused tests and observe failure**

```bash
supabase test db supabase/tests/projects_rooms_stage.test.sql
pnpm --filter @meld/web test -- src/features/rooms/actions.test.ts src/features/projects/components/move-room-dialog.test.tsx
```

Expected: FAIL because `move_room` is absent.

- [ ] **Step 3: Implement the locked move function**

Use this transaction shape:

```sql
select room.* into current_room
from public.rooms as room
where room.id = target_room_id
for update;

if current_room.project_id = target_project_id then
  return current_room.project_id;
end if;

update public.rooms
set project_id = target_project_id,
    updated_at = now()
where id = target_room_id
returning project_id into moved_project_id;
```

Before the update, require Room participation and owner-or-workspace-admin authority, and verify the target Project's `workspace_id` equals the Room's immutable `workspace_id`. Keep the composite foreign key as the final database backstop.

- [ ] **Step 4: Implement the server action and dialog success path**

First inspect the Astryx dialog, selector, and menu APIs:

```bash
pnpm exec astryx build "move a room between workspace projects"
pnpm exec astryx template FormLayoutMixedControls
pnpm exec astryx component Dialog
pnpm exec astryx component Selector
pnpm exec astryx component DropdownMenu
```

Parse both UUIDs, call the RPC, close the dialog on success, update open Project state to the returned ID, and call `router.refresh()`. Do not push a new URL. Add Move Room with the Boxicons `Move` icon to eligible Room overflow menus only.

- [ ] **Step 5: Run focused tests**

```bash
supabase test db supabase/tests/projects_rooms_stage.test.sql
pnpm --filter @meld/web test -- src/features/rooms/actions.test.ts src/features/projects/components/move-room-dialog.test.tsx
```

Expected: PASS.

- [ ] **Step 6: Commit Room movement**

```bash
git add supabase/migrations/202608110004_room_move.sql supabase/tests/projects_rooms_stage.test.sql apps/web/src/features/rooms/actions.ts apps/web/src/features/rooms/actions.test.ts apps/web/src/features/projects/components/move-room-dialog.tsx apps/web/src/features/projects/components/move-room-dialog.test.tsx apps/web/src/ui/workspace-navigation.tsx apps/web/src/ui/workspace-navigation.test.tsx
git commit -m "feat: move rooms between workspace projects"
```

---

### Task 6: Add Durable User Flow Lifecycle Metadata

**Files:**
- Create: `supabase/migrations/202608110005_user_flow_lifecycle.sql`
- Create: `supabase/tests/user_flow_lifecycle.test.sql`
- Create: `apps/web/src/features/canvas/user-flow-lifecycle.ts`
- Create: `apps/web/src/features/canvas/user-flow-lifecycle.test.ts`
- Create: `apps/web/src/features/rooms/components/empty-room-start.tsx`
- Create: `apps/web/src/features/rooms/components/empty-room-start.test.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-trial-tab.tsx`
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`

**Interfaces:**
- Consumes: Room edit authorization and the gateway canvas from the setup branch.
- Produces: `start_user_flow(uuid) -> user_flows`, `startUserFlow(roomId)`, `hasUserFlow`, and empty-Room starting actions.

- [ ] **Step 1: Write failing pgTAP and server-action tests**

pgTAP must cover editor/owner start, view-only rejection, nonparticipant rejection, same-Room idempotency, caller as `created_by`, participant-only reads, and Realtime publication membership. The server-action test must prove two retries return the same lifecycle row while the database retains one row.

- [ ] **Step 2: Run tests and observe failure**

```bash
supabase test db supabase/tests/user_flow_lifecycle.test.sql
pnpm --filter @meld/web test -- src/features/canvas/user-flow-lifecycle.test.ts
```

Expected: FAIL because `user_flows` and `start_user_flow` do not exist.

- [ ] **Step 3: Implement lifecycle storage and idempotent start**

```sql
create table public.user_flows (
  room_id uuid primary key references public.rooms(id) on delete cascade,
  created_by uuid not null references auth.users(id),
  created_at timestamptz not null default now()
);
```

`start_user_flow` must require `can_edit_room`, insert with `on conflict (room_id) do nothing`, then select and return the authoritative row. Add participant read RLS, no direct authenticated writes, and Realtime publication.

- [ ] **Step 4: Implement the server wrapper and Room query flag**

```ts
export async function startUserFlow(roomId: string): Promise<UserFlowLifecycle> {
  const parsedRoomId = z.string().uuid().parse(roomId);
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("start_user_flow", {
    target_room_id: parsedRoomId,
  });
  if (error) throw new Error("We could not start that user flow.");
  return UserFlowLifecycleSchema.parse(data);
}
```

Extend Room page data with `hasUserFlow` from `user_flows`, independent of `MELD_USER_FLOW_TRIAL_ENABLED`.

- [ ] **Step 5: Discover and implement empty-Room starting actions**

```bash
pnpm exec astryx build "empty collaboration room starting actions paste notes start user flow start talking"
pnpm exec astryx template EmptyStateActions
pnpm exec astryx component List
pnpm exec astryx component Button
pnpm exec astryx component Icon
```

Use the existing starting-point visual pattern without Card-wrapping the whole page. Start User Flow calls the lifecycle action before selecting the User Flows surface. View-only participants do not see creation actions.

- [ ] **Step 6: Run focused lifecycle and UI tests**

```bash
supabase test db supabase/tests/user_flow_lifecycle.test.sql
pnpm --filter @meld/web test -- src/features/canvas/user-flow-lifecycle.test.ts src/features/rooms/components/empty-room-start.test.tsx
pnpm check:astryx
```

Expected: PASS.

- [ ] **Step 7: Commit User Flow lifecycle metadata**

```bash
git add supabase/migrations/202608110005_user_flow_lifecycle.sql supabase/tests/user_flow_lifecycle.test.sql apps/web/src/features/canvas apps/web/src/features/rooms/components/empty-room-start.tsx apps/web/src/features/rooms/components/empty-room-start.test.tsx apps/web/src/app/'(app)'/'[workspaceId]'/rooms/'[roomId]'/page.tsx
git commit -m "feat: track durable user flow lifecycle"
```

---

### Task 7: Centralize Progressive Room Surface Resolution

**Files:**
- Create: `apps/web/src/features/rooms/surfaces.ts`
- Create: `apps/web/src/features/rooms/surfaces.test.ts`
- Move: `apps/web/src/features/prd/components/room-tabs.ts` -> `apps/web/src/features/rooms/room-tabs.ts`
- Move: `apps/web/src/features/prd/components/room-tab-strip.tsx` -> `apps/web/src/features/rooms/components/room-tab-strip.tsx`
- Move: `apps/web/src/features/prd/components/room-tab-strip.test.tsx` -> `apps/web/src/features/rooms/components/room-tab-strip.test.tsx`
- Create: `apps/web/src/features/rooms/use-room-surface-realtime.ts`
- Create: `apps/web/src/features/rooms/use-room-surface-realtime.test.tsx`
- Create: `supabase/migrations/202608110006_room_surface_broadcast.sql`
- Create: `supabase/tests/room_surface_broadcast.test.sql`
- Modify: `scripts/check-room-sql.mjs`
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`
- Modify: `apps/web/src/features/rooms/queries.ts`

**Interfaces:**
- Consumes: `hasUserFlow`, PRD existence/task state, and decision count.
- Produces: `RoomSurface`, `getRoomSurfaces`, `resolveRoomSurface`, and a tab strip that disappears for Conversation-only Rooms.

- [ ] **Step 1: Write the complete failing surface table**

```ts
it.each([
  [{ hasUserFlow: false, hasPrd: false, hasPrdTask: false, decisionCount: 0 }, ["conversation"]],
  [{ hasUserFlow: true, hasPrd: false, hasPrdTask: false, decisionCount: 0 }, ["conversation", "user-flows"]],
  [{ hasUserFlow: false, hasPrd: true, hasPrdTask: false, decisionCount: 0 }, ["conversation", "prd"]],
  [{ hasUserFlow: false, hasPrd: false, hasPrdTask: false, decisionCount: 1 }, ["conversation", "decisions"]],
  [{ hasUserFlow: true, hasPrd: true, hasPrdTask: false, decisionCount: 0 }, ["conversation", "user-flows", "prd", "overview"]],
  [{ hasUserFlow: true, hasPrd: false, hasPrdTask: false, decisionCount: 1 }, ["conversation", "user-flows", "decisions", "overview"]],
])("resolves artifact-backed surfaces", (input, expected) => {
  expect(getRoomSurfaces(input)).toEqual(expected);
});
```

Also assert an unavailable requested tab resolves to Conversation with `shouldReplaceUrl: true`.

- [ ] **Step 2: Run tests and observe failure**

```bash
pnpm --filter @meld/web test -- src/features/rooms/surfaces.test.ts
```

Expected: FAIL because `getRoomSurfaces` is absent.

- [ ] **Step 3: Implement pure surface and URL resolution**

Inspect the tab APIs before moving the shared UI:

```bash
pnpm exec astryx build "progressive room tabs for conversation user flows prd decisions overview"
pnpm exec astryx template editor
pnpm exec astryx component TabList
```

```ts
export type RoomSurface =
  | "conversation"
  | "user-flows"
  | "prd"
  | "decisions"
  | "overview";

export type RoomSurfaceState = {
  hasUserFlow: boolean;
  hasPrd: boolean;
  hasPrdTask: boolean;
  decisionCount: number;
};

export function getRoomSurfaces(state: RoomSurfaceState): RoomSurface[] {
  const artifacts: RoomSurface[] = [];
  if (state.hasUserFlow) artifacts.push("user-flows");
  if (state.hasPrd || state.hasPrdTask) artifacts.push("prd");
  if (state.decisionCount > 0) artifacts.push("decisions");
  return [
    "conversation",
    ...artifacts,
    ...(artifacts.length >= 2 ? (["overview"] as const) : []),
  ];
}
```

`resolveRoomSurface` accepts unknown input, returns `{ activeSurface, shouldReplaceUrl }`, and never allows deferred `tasks`.

- [ ] **Step 4: Make the Room page server-authoritative**

Query only the data needed to determine surfaces before fetching active-surface content. Render no `TabList` when `surfaces.length === 1`. When `shouldReplaceUrl` is true, render Conversation and use a tiny client effect with ``router.replace(`${basePath}?tab=conversation`)`` so the user is not sent through a redirect loop.

Add forward-only triggers on `user_flows` and `decisions` INSERT/DELETE that call `realtime.broadcast_changes` with the existing private `room:<uuid>` topic and a `room-surfaces-changed` event. Add `useRoomSurfaceRealtime(roomId)` to subscribe to that authenticated Room-scoped broadcast. Debounce simultaneous events into one `router.refresh()`. On reconnect, refresh once before resuming. This is what makes another participant's flow start or last-decision deletion update tabs and trigger the active-tab fallback without relying on unsupported filtered Postgres DELETE payloads.

- [ ] **Step 5: Run surface, tab, and page tests**

```bash
pnpm --filter @meld/web test -- src/features/rooms/surfaces.test.ts src/features/rooms/components/room-tab-strip.test.tsx src/features/rooms/use-room-surface-realtime.test.tsx 'src/app/(app)/[workspaceId]/rooms/[roomId]/page.test.tsx'
pnpm --filter @meld/web typecheck
pnpm exec supabase test db supabase/tests/room_surface_broadcast.test.sql
pnpm check:sql-rooms
```

Expected: PASS.

- [ ] **Step 6: Commit progressive emergence**

```bash
git add apps/web/src/features/rooms apps/web/src/features/prd/components apps/web/src/app/'(app)'/'[workspaceId]'/rooms/'[roomId]' supabase/migrations/202608110006_room_surface_broadcast.sql supabase/tests/room_surface_broadcast.test.sql scripts/check-room-sql.mjs
git commit -m "feat: derive room surfaces from durable artifacts"
```

---

### Task 8: Implement Decisions and Deterministic Overview Surfaces

**Files:**
- Create: `apps/web/src/features/rooms/components/decisions-surface.tsx`
- Create: `apps/web/src/features/rooms/components/decisions-surface.test.tsx`
- Create: `apps/web/src/features/rooms/components/room-overview.tsx`
- Create: `apps/web/src/features/rooms/components/room-overview.test.tsx`
- Create: `apps/web/src/features/rooms/overview.ts`
- Create: `apps/web/src/features/rooms/overview.test.ts`
- Modify: `apps/web/src/features/rooms/queries.ts`
- Modify: `apps/web/src/features/rooms/components/conversation.tsx`
- Modify: `apps/web/src/features/rooms/components/conversation.test.tsx`
- Modify: `apps/web/src/app/(app)/[workspaceId]/rooms/[roomId]/page.tsx`

**Interfaces:**
- Consumes: room artifacts, stage events, participants, and the active surface from Task 7.
- Produces: `listRoomDecisions`, `getRoomOverview`, `DecisionsSurface`, and `RoomOverview`.

- [ ] **Step 1: Discover Astryx list and summary primitives**

```bash
pnpm exec astryx build "dense room decisions list and deterministic work overview"
pnpm exec astryx template ListBasicList
pnpm exec astryx component List
pnpm exec astryx component ListItem
pnpm exec astryx component Section
pnpm exec astryx component Badge
```

- [ ] **Step 2: Write failing query and component tests**

Decisions must sort chronologically, show summary/author/time, and link to `?tab=conversation&message={sourceMessageId}` only when a source exists. Overview must show current stage, latest activity, participant count, artifact counts, and at most three recent decisions. Assert no AI service or AI task function is invoked.

- [ ] **Step 3: Run tests and observe failure**

```bash
pnpm --filter @meld/web test -- src/features/rooms/overview.test.ts src/features/rooms/components/decisions-surface.test.tsx src/features/rooms/components/room-overview.test.tsx
```

Expected: FAIL because the surfaces do not exist.

- [ ] **Step 4: Implement room-scoped queries and presentation**

Return a stable view model:

```ts
export type RoomOverviewData = {
  stage: RoomStage;
  latestActivityAt: string;
  participantCount: number;
  counts: { userFlows: number; prds: number; decisions: number };
  recentDecisions: Array<{
    id: string;
    summary: string;
    createdAt: string;
    createdByName: string;
  }>;
};
```

Render Decisions as one edge-to-edge `List`; do not Card-wrap rows. Render Overview as unframed page sections with compact headings. Use Badge only for enumerated PRD status, not counts or decoration. When `message={sourceMessageId}` is present on Conversation, scroll the matching persisted message into view after hydration and give it transient focus without changing message content.

- [ ] **Step 5: Run focused tests and Astryx checks**

```bash
pnpm --filter @meld/web test -- src/features/rooms/overview.test.ts src/features/rooms/components/decisions-surface.test.tsx src/features/rooms/components/room-overview.test.tsx
pnpm check:astryx
```

Expected: PASS.

- [ ] **Step 6: Commit Room artifact surfaces**

```bash
git add apps/web/src/features/rooms apps/web/src/app/'(app)'/'[workspaceId]'/rooms/'[roomId]'/page.tsx
git commit -m "feat: add decisions and room overview surfaces"
```

---

### Task 9: Extend the Typed Room Proposal Contract and Settlement Validation

**Files:**
- Modify: `packages/contracts/src/ai.ts`
- Modify: `packages/contracts/src/ai.test.ts`
- Modify: `packages/contracts/src/rooms.ts`
- Modify: `apps/connector/src/tasks/product-agent-prompt.ts`
- Modify: `apps/connector/src/tasks/product-agent-prompt.test.ts`
- Create: `supabase/migrations/202608110007_room_proposal_contract.sql`
- Create: `supabase/tests/room_proposals.test.sql`
- Modify: `apps/web/src/features/rooms/schemas.ts`
- Modify: `apps/web/src/features/rooms/repository.ts`
- Modify: `apps/web/src/features/rooms/repository.test.ts`

**Interfaces:**
- Consumes: existing `prd_generate`/`prd_revise` proposal flow and frozen AI context manifests.
- Produces: the exact four-kind `RoomProposedActionSchema` and settlement validation for `user_flow_generate` and `decision_capture`.

- [ ] **Step 1: Add failing contract tests for every accepted and rejected shape**

```ts
expect(RoomProposedActionSchema.parse({ kind: "user_flow_generate" })).toEqual({
  kind: "user_flow_generate",
});

expect(RoomProposedActionSchema.parse({
  kind: "decision_capture",
  summary: "Keep recovery codes single-use.",
  sourceMessageId: MESSAGE_ID,
})).toEqual({
  kind: "decision_capture",
  summary: "Keep recovery codes single-use.",
  sourceMessageId: MESSAGE_ID,
});

expect(RoomProposedActionSchema.safeParse({
  kind: "decision_capture",
  summary: "",
  sourceMessageId: null,
}).success).toBe(false);
```

Also reject extra keys, a summary over 5,000 characters, invalid UUIDs, `task_create`, and missing nullable `sourceMessageId`.

- [ ] **Step 2: Run contract tests and observe failure**

```bash
pnpm --filter @meld/contracts test -- ai.test.ts rooms.test.ts
```

Expected: FAIL because the new proposal kinds are rejected.

- [ ] **Step 3: Implement the strict shared proposal schema**

```ts
export const RoomProposedActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("prd_generate") }).strict(),
  z.object({ kind: z.literal("prd_revise") }).strict(),
  z.object({ kind: z.literal("user_flow_generate") }).strict(),
  z.object({
    kind: z.literal("decision_capture"),
    summary: z.string().trim().min(1).max(5000),
    sourceMessageId: z.string().uuid().nullable(),
  }).strict(),
]);
```

Use this schema in `RoomReplyResultSchema` and the web message mapper.

- [ ] **Step 4: Update the Product Agent response schema and prompt**

The JSON schema must express the discriminated union without accepting arbitrary properties. Add concise prompt rules: propose `user_flow_generate` when the team clearly asks to map a journey or substantial pasted notes describe a coherent journey, and propose `decision_capture` only for an explicit durable decision; copy the exact summary and cite a frozen source message when available. Never emit `task_create`.

- [ ] **Step 5: Add failing settlement pgTAP cases**

Prove valid new actions persist, over-specified JSON becomes `null`, human messages cannot carry actions, decision source messages must belong to the Room and frozen manifest, and Research Agent messages cannot create durable proposals.

- [ ] **Step 6: Implement SQL shape and manifest validation**

Add an immutable, table-free helper `room_proposed_action_shape_ok(jsonb)` for the check constraint and a settlement helper that validates Room/source/manifest context. Recreate only the latest canonical `settle_ai_task` body from the merged baseline and delegate proposal validation to the helper, leaving lock order, task transition, citation checks, and fingerprinting unchanged.

- [ ] **Step 7: Run contract, connector, repository, and pgTAP tests**

```bash
pnpm --filter @meld/contracts test -- ai.test.ts rooms.test.ts
pnpm --filter @meld/connector test -- product-agent-prompt.test.ts
pnpm --filter @meld/web test -- src/features/rooms/repository.test.ts
supabase test db supabase/tests/room_proposals.test.sql
pnpm check:sql-arities
```

Expected: PASS.

- [ ] **Step 8: Commit proposal contracts**

```bash
git add packages/contracts apps/connector/src/tasks/product-agent-prompt.ts apps/connector/src/tasks/product-agent-prompt.test.ts apps/web/src/features/rooms supabase/migrations/202608110007_room_proposal_contract.sql supabase/tests/room_proposals.test.sql
git commit -m "feat: add typed room structure proposals"
```

---

### Task 10: Add Durable Proposal Dismissal and Idempotent Acceptance

**Files:**
- Create: `supabase/migrations/202608110008_room_proposal_responses.sql`
- Modify: `supabase/tests/room_proposals.test.sql`
- Create: `apps/web/src/features/rooms/proposals.ts`
- Create: `apps/web/src/features/rooms/proposals.test.ts`
- Create: `apps/web/src/features/rooms/components/room-proposal-action.tsx`
- Create: `apps/web/src/features/rooms/components/room-proposal-action.test.tsx`
- Modify: `apps/web/src/features/rooms/components/conversation.tsx`
- Modify: `apps/web/src/features/canvas/user-flow-generation.ts`

**Interfaces:**
- Consumes: validated immutable proposal payloads from Task 9.
- Produces: `dismissMessageProposal`, `captureProposedDecision`, `acceptProposedUserFlow`, per-user filtering, and accessible proposal controls.

- [ ] **Step 1: Add failing pgTAP tests for response isolation and idempotency**

Cover per-user dismissal, other-participant visibility, nonparticipant rejection, accepted response insertion with artifact creation, two concurrent decision accepts producing one `decisions` row, user-flow accept producing one `user_flows` row and one generation task, wrong-kind rejection, and retry returning the existing artifact/task.

- [ ] **Step 2: Run pgTAP and observe failure**

```bash
supabase test db supabase/tests/room_proposals.test.sql
```

Expected: FAIL because response storage and mutation functions are absent.

- [ ] **Step 3: Implement response and decision idempotency schema**

```sql
create type public.proposal_response as enum ('accepted', 'dismissed');

create table public.message_proposal_responses (
  message_id uuid not null references public.messages(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  response public.proposal_response not null,
  created_at timestamptz not null default now(),
  primary key (message_id, user_id)
);

alter table public.decisions
  add column proposal_message_id uuid unique
  references public.messages(id) on delete restrict;
```

Add own-user plus Room-participant RLS. Direct inserts remain revoked.

- [ ] **Step 4: Implement the three locked mutation functions**

`dismiss_message_proposal` upserts only the caller's dismissed response. `capture_proposed_decision` locks the proposal message, verifies `decision_capture`, inserts from the stored summary/source with `on conflict (proposal_message_id)`, and records accepted. Add a private `create_user_flow_generate_task_internal(room, provider, clarification, source_message_id)` helper in this forward migration, and replace the existing three-argument public creator with a same-signature wrapper that passes `null` as the source. `accept_proposed_user_flow` locks the proposal, verifies `user_flow_generate`, idempotently starts the flow, and calls the private helper with `source_message_id` set to the proposal message and a context manifest frozen at acceptance time. Add a partial unique index on `(source_message_id, kind)` for non-null `source_message_id` where `kind = 'user_flow_generate'`; on retry, return the existing task regardless of terminal state. Record accepted and return `{ user_flow, task }` JSON in the same transaction.

- [ ] **Step 5: Write failing server-action and component tests**

Assert exact RPC names, stable errors, dismissed proposals staying hidden after rerender with persisted response data, decision summary shown before confirmation, view-only users allowed to dismiss but not accept user-flow generation, and duplicate clicks disabled while the first request runs.

- [ ] **Step 6: Implement server actions and the proposal component**

Inspect the explicit-confirmation pattern and every component used:

```bash
pnpm exec astryx build "inline AI proposal confirm or dismiss in a room conversation"
pnpm exec astryx template ChatComposerDrawerFeedback
pnpm exec astryx component Button
pnpm exec astryx component Banner
pnpm exec astryx component Text
```

```ts
export type RoomProposalActionProps = {
  messageId: string;
  action: RoomProposedAction;
  canEdit: boolean;
  response: "accepted" | "dismissed" | null;
};
```

Use Astryx `Button`, `Banner`, and `Text`. Show the exact decision summary. Use explicit command labels: `Capture decision`, `Create user flow`, and `Dismiss`. Existing PRD buttons continue using their established handlers but gain the shared Dismiss control.

- [ ] **Step 7: Run focused proposal checks**

```bash
supabase test db supabase/tests/room_proposals.test.sql
pnpm --filter @meld/web test -- src/features/rooms/proposals.test.ts src/features/rooms/components/room-proposal-action.test.tsx src/features/rooms/components/conversation.test.tsx
pnpm check:astryx
```

Expected: PASS.

- [ ] **Step 8: Commit proposal confirmation workflows**

```bash
git add supabase/migrations/202608110008_room_proposal_responses.sql supabase/tests/room_proposals.test.sql apps/web/src/features/rooms apps/web/src/features/canvas/user-flow-generation.ts
git commit -m "feat: confirm or dismiss room proposals"
```

---

### Task 11: Add Content-Free Workspace Attention Indicators

**Files:**
- Create: `supabase/migrations/202608110009_workspace_attention.sql`
- Create: `supabase/tests/workspace_attention.test.sql`
- Create: `apps/web/src/features/workspaces/attention-summary.ts`
- Create: `apps/web/src/features/workspaces/attention-summary.test.ts`
- Modify: `apps/web/src/app/(app)/[workspaceId]/layout.tsx`
- Modify: `apps/web/src/ui/workspace-navigation.tsx`
- Modify: `apps/web/src/ui/workspace-navigation.test.tsx`

**Interfaces:**
- Consumes: unacknowledged mentions and the current user's Workspace/Room access.
- Produces: `list_workspace_attention() -> table(workspace_id uuid, has_attention boolean)` and workspace rail attention dots.

- [ ] **Step 1: Add failing isolation and output-shape pgTAP tests**

Seed attention in two Workspaces and assert the function returns only rows for the authenticated user's memberships, only the two allowed columns, true for unresolved attention, false after acknowledgement, and no Room/message/client content.

- [ ] **Step 2: Run pgTAP and observe failure**

```bash
supabase test db supabase/tests/workspace_attention.test.sql
```

Expected: FAIL because `list_workspace_attention` is absent.

- [ ] **Step 3: Implement the content-free summary function**

Return all of the caller's Workspaces with an `exists` subquery over unacknowledged mentions in participant-visible Rooms:

```sql
return query
select membership.workspace_id,
  exists (
    select 1
    from public.mentions as mention
    join public.rooms as room on room.id = mention.room_id
    where room.workspace_id = membership.workspace_id
      and mention.mentioned_user_id = auth.uid()
      and mention.acknowledged_at is null
      and public.is_room_participant(room.id)
  ) as has_attention
from public.memberships as membership
where membership.user_id = auth.uid();
```

Revoke PUBLIC and grant execute to authenticated.

- [ ] **Step 4: Write failing web mapping and accessibility tests**

Assert a malformed RPC row fails closed, workspace ordering remains unchanged, only true rows render dots, and the selected Workspace item exposes `Northstar needs attention` without rendering any hidden Room name or message body.

- [ ] **Step 5: Implement attention mapping and rail presentation**

Inspect the existing rail template and status primitive first:

```bash
pnpm exec astryx build "workspace rail with private attention status"
pnpm exec astryx template shell-side-nav
pnpm exec astryx component StatusDot
pnpm exec astryx component SideNav
```

Fetch the summary in parallel with Room/Project navigation data in the Workspace layout. Pass `hasAttention` on each Workspace view model. Render Astryx `StatusDot` with a visible or screen-reader label; do not communicate attention through color alone.

- [ ] **Step 6: Run attention checks**

```bash
supabase test db supabase/tests/workspace_attention.test.sql
pnpm --filter @meld/web test -- src/features/workspaces/attention-summary.test.ts src/ui/workspace-navigation.test.tsx
pnpm check:astryx
```

Expected: PASS.

- [ ] **Step 7: Commit Workspace attention**

```bash
git add supabase/migrations/202608110009_workspace_attention.sql supabase/tests/workspace_attention.test.sql apps/web/src/features/workspaces apps/web/src/app/'(app)'/'[workspaceId]'/layout.tsx apps/web/src/ui/workspace-navigation.tsx apps/web/src/ui/workspace-navigation.test.tsx
git commit -m "feat: show private workspace attention status"
```

---

### Task 12: Add End-to-End Room Lifecycle Coverage

**Files:**
- Create: `e2e/room-lifecycle.spec.ts`
- Create: `e2e/workspace-project-navigation.spec.ts`
- Modify: `e2e/global-setup.ts`
- Modify: `apps/web/src/features/rooms/e2e-fake.ts`
- Modify: `apps/web/src/features/workspaces/e2e-fake.ts`
- Create: `apps/web/src/features/canvas/e2e-fake.ts`
- Modify: `playwright.config.ts`

**Interfaces:**
- Consumes: all prior database, action, and UI slices.
- Produces: browser-level proof of the corrected design contract.

- [ ] **Step 1: Extend deterministic E2E seed helpers**

Add stable fixture IDs for two Workspaces, three Projects, an owner, editor, viewer, participating admin, nonparticipant admin, empty Room, PRD Room, and proposal Room. Fake mode must use the same `RoomStage`, `RoomSurface`, and proposal schemas as production.

- [ ] **Step 2: Write the Room lifecycle specification**

Cover these steps in one serial flow:

```ts
test("one room preserves context while structure and stage evolve", async ({ page }) => {
  await page.goto(`/${WORKSPACE_ID}/rooms/${ROOM_ID}`);
  await expect(page.getByRole("tablist")).toHaveCount(0);
  await page.getByRole("button", { name: "Start a user flow" }).click();
  await expect(page.getByRole("link", { name: "User Flows" })).toBeVisible();
  await page.getByLabel("Room stage").click();
  await page.getByRole("option", { name: "Design" }).click();
  await expect(page.getByLabel("Room stage")).toHaveText(/Design/);
  await expect(page).toHaveURL(`/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=user-flows`);
});
```

Continue with PRD-before-flow independence, decision and Overview thresholds, invalid tab fallback, proposal dismissal across reload, and idempotent proposal acceptance.

- [ ] **Step 3: Write multi-context stage and move coverage**

Open owner and participating-admin browser contexts. Change the stage in one and assert header plus sidebar update in the other. Move the Room in one and assert the other context opens the destination Project while the URL remains unchanged.

- [ ] **Step 4: Write Workspace and Project navigation coverage**

Verify one-open accordion behavior, active Room Project reveal on deep link, admin-only Project creation, per-Project Room creation, Project delete restriction, workspace-specific stored accordion state, attention dots, and absence of inactive-workspace content.

- [ ] **Step 5: Run focused Playwright tests**

```bash
pnpm exec playwright test e2e/room-lifecycle.spec.ts e2e/workspace-project-navigation.spec.ts --workers=1
```

Expected: PASS with no retries.

- [ ] **Step 6: Commit E2E coverage**

```bash
git add e2e apps/web/src/features/rooms/e2e-fake.ts apps/web/src/features/workspaces/e2e-fake.ts apps/web/src/features/canvas/e2e-fake.ts playwright.config.ts
git commit -m "test: cover workspace project room lifecycle"
```

---

### Task 13: Run Full Verification and Final Review

**Files:**
- Modify only files required by failures attributable to Tasks 1-12.

**Interfaces:**
- Consumes: completed implementation.
- Produces: green repository gates and a reviewable final diff against `origin/main`.

- [ ] **Step 1: Run static and convention checks**

```bash
source "$HOME/.nvm/nvm.sh"
nvm use 22.23.2
pnpm check:astryx
pnpm check:contract-enums
pnpm check:sql-arities
pnpm check:sql-rooms
pnpm check:test-colocation
pnpm lint
pnpm typecheck
```

Expected: every command exits 0.

- [ ] **Step 2: Run unit, integration, and database suites**

```bash
pnpm test
pnpm test:db
```

Expected: every suite PASS; no skipped new lifecycle tests.

- [ ] **Step 3: Run relevant browser suites**

```bash
pnpm exec playwright test e2e/room-lifecycle.spec.ts e2e/workspace-project-navigation.spec.ts e2e/room.spec.ts e2e/prd-generate.spec.ts e2e/prd-edit-acceptance.spec.ts e2e/user-flow-trial.spec.ts --workers=1
```

Expected: all specifications PASS without retry.

- [ ] **Step 4: Perform the final vocabulary and scope scans**

```bash
git grep -nE 'organizationId|organization_id|organizations|discovery_rooms|DiscoveryRoom|discoveryRoom' -- apps packages e2e scripts supabase/tests
git grep -nE 'task_create|Tasks surface|Feature Room|Move to Feature Room' -- apps packages e2e supabase
git diff --check origin/main...
```

Expected: only explicitly allowed storage literals, migration assertions, and genuine historical/domain language remain; no user-facing Feature Room conversion or domain Task implementation remains.

- [ ] **Step 5: Review the complete change surface**

```bash
git diff --stat origin/main...
git diff --name-status origin/main...
git log --oneline origin/main..HEAD
```

Confirm every spec section maps to a completed task, all migration files are forward-only, and no unrelated files changed.

If verification exposes a regression attributable to Tasks 1-12, return to the owning task, add the missing focused regression test, fix it, rerun that task's gates, and commit only its explicit file set before repeating Task 13.
