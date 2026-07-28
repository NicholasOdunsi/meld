# Workspace Switcher

## Goal

Let a user who belongs to more than one workspace (organization) switch
between them from the workspace rail, instead of only ever seeing their
current workspace's logo there.

## Current state

The workspace rail (`apps/web/src/ui/dashboard-navigation.tsx`) renders one
`SideNavItem` for the current organization's logo and a second `SideNavItem`
for "Create workspace", which links to `/onboarding`. It has no way to show
other organizations the user belongs to.

The `memberships` table already supports a user belonging to many
organizations (many-to-many, RLS-scoped via `is_org_member`), and root routing
(`/`) already picks a default workspace by oldest membership. No schema
changes are needed for this feature.

## Behavior

- The workspace rail lists every workspace the signed-in user is a member of,
  as icon-only logos, ordered oldest-membership-first — the same rule root
  routing already uses to pick a default workspace.
- Clicking a workspace's logo navigates to that workspace's home
  (`/<organization-id>`), matching the existing behavior of the current
  workspace's own logo.
- The current workspace's icon is visually marked selected, as today.
- "Create workspace" stays pinned at the bottom of the rail. The workspace
  list above it scrolls independently once it no longer fits, rather than
  growing the rail unbounded.
- Each icon shows a hover tooltip with its workspace name, since the rail is
  icon-only.
- Root routing / default-workspace selection is unchanged.

## Data

Add `listUserWorkspaces()` to the `WorkspaceBackend` interface
(`apps/web/src/features/workspaces/backend.ts`):

```
listUserWorkspaces(): Promise<WorkspaceSummary[]>

type WorkspaceSummary = {
  organizationId: string;
  organizationName: string;
  organizationLogoUrl: string | null;
};
```

Returns workspaces ordered by the caller's `memberships.created_at`,
ascending. Returns `[]` for a signed-out caller; the org layout already
redirects unauthenticated requests before this matters, so this method stays
defensive rather than throwing.

- **Supabase implementation:** query `memberships` for the current user
  joined to `organizations(id,name,logo_path)`, ordered by `created_at`.
  Resolve each `logo_path` to a public URL the same way
  `getOrganizationShell` already does.
- **E2E fake implementation:** filter the in-memory `memberships` array by
  user id, sorted by `createdAt`, resolved against the `organizations` Map.

## UI

- `apps/web/src/app/(app)/[organizationId]/layout.tsx` fetches `workspaces`
  from `listUserWorkspaces()` alongside its existing `getOrganizationShell`
  and `listDiscoveryRooms` calls, and passes it to `DashboardNavigation`.
- `DashboardNavigation` renders the rail's workspace list from `workspaces`
  instead of a single hardcoded item. The entry whose `organizationId`
  matches the current route is marked selected.
- The rail's `SideNav` renders the workspace items as its scrollable
  `children` zone (native to Astryx `SideNav`) and moves "Create workspace"
  into the `footerIcons` slot, which Astryx already keeps pinned to the
  bottom. This gives independent scrolling for free instead of hand-rolled
  CSS.
- Each workspace `SideNavItem` is wrapped in an Astryx `Tooltip` (placement
  `end`) showing the workspace name. "Create workspace" gets the same
  treatment for consistency, since it's also icon-only.

## Testing

- Extend the existing `dashboard-navigation` component test: multiple
  workspaces render as separate rail items, the current one is selected,
  each links to `/<organization-id>`, tooltip content matches workspace
  names, and "Create workspace" still renders and still links to
  `/onboarding`.
- Unit tests for `listUserWorkspaces` on both the Supabase and fake
  backends: ordering by membership creation time, logo URL resolution, and
  the empty-array signed-out case.
- New Playwright end-to-end test: sign in, create a second workspace from
  the rail's "Create workspace" action, confirm both logos appear in the
  rail, click the first workspace, and confirm navigation lands on its home.
- Run web unit tests, typecheck, lint, Astryx convention checks, and the
  production build.

## Non-goals

- Reordering workspaces (e.g. drag-and-drop, pinning, most-recently-visited
  ordering).
- Changing root-routing's default-workspace selection.
- A dropdown/combobox-style switcher; the rail's icon list is the only entry
  point being built here.
