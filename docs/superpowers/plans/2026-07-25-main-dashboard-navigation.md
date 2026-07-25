# Main Dashboard Navigation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the temporary organization navigation with a Slack-inspired workspace rail and room-aware sidebar built from Astryx and Boxicons.

**Architecture:** A focused client navigation component owns pathname-based selection and renders both rails from serializable organization and Discovery Room data. The authenticated organization server layout remains responsible for membership checks and room loading, while `AppFrame` continues to own the outer Astryx `AppShell`.

**Tech Stack:** Next.js App Router, React, TypeScript, Astryx Design System 0.1.8, Boxicons React 1.0.3, Vitest, Testing Library, Playwright

## Global Constraints

- Keep the current onboarding destination and existing conversation, inspector, members, and room-creation content unchanged.
- Remove the room-detail page's duplicate Discovery Room rail after the persistent shell owns that navigation.
- Use Astryx components for all layout and interaction.
- Use Boxicons for Home, Search, Mentions, Settings, room, workspace, feature, and plus icons.
- Do not add a raw layout element, stylesheet, utility class, hardcoded color, or hardcoded pixel style.
- Show Search and Mentions as disabled until their product systems exist.
- Do not add manual Feature Room creation or fabricate Feature Room records.
- Preserve the untracked `docs/product-feature-checklist.md`.

---

### Task 1: Dashboard navigation component

**Files:**
- Create: `apps/web/src/ui/dashboard-navigation.tsx`
- Create: `apps/web/src/ui/dashboard-navigation.test.tsx`
- Modify: `apps/web/src/ui/app-frame.test.tsx`

**Interfaces:**
- Consumes: `organizationId: string`, `organizationName: string`, and `rooms: Array<{ id: string; name: string }>`
- Produces: `DashboardNavigation(props): JSX.Element`, containing the workspace rail and main sidebar.

- [ ] **Step 1: Write the failing navigation test**

```tsx
render(
  <DashboardNavigation
    organizationId={ORGANIZATION_ID}
    organizationName="Northstar"
    rooms={[{ id: ROOM_ID, name: "Customer interviews" }]}
  />,
);

expect(screen.getByText("Northstar")).toBeVisible();
expect(screen.getByText("Home")).toBeVisible();
expect(screen.getByText("Search").closest("a, button")).toHaveAttribute(
  "aria-disabled",
  "true",
);
expect(screen.getByText("Mentions").closest("a, button")).toHaveAttribute(
  "aria-disabled",
  "true",
);
expect(
  screen.getByRole("link", { name: "Customer interviews" }),
).toHaveAttribute(
  "href",
  `/${ORGANIZATION_ID}/discovery/${ROOM_ID}`,
);
expect(screen.getByText("Feature Rooms")).toBeVisible();
```

Update the AppFrame contract test to pass a complete Astryx `SideNav` through
the `navigation` slot. Assert the frame still provides one main region and
renders the supplied navigation without assuming AppFrame owns resize or
collapse behavior.

- [ ] **Step 2: Run the focused test and verify it fails**

Run: `pnpm --filter @meld/web test -- src/ui/dashboard-navigation.test.tsx`

Expected: FAIL because `DashboardNavigation` does not exist.

- [ ] **Step 3: Implement the dual-rail Astryx navigation**

```tsx
export type DashboardNavigationRoom = {
  id: string;
  name: string;
};

export function DashboardNavigation({
  organizationId,
  organizationName,
  rooms,
}: {
  organizationId: string;
  organizationName: string;
  rooms: DashboardNavigationRoom[];
}) {
  const pathname = usePathname();
  const discoveryPath = `/${organizationId}/discovery`;

  return (
    <HStack gap={0} height="100%">
      <SideNav
        collapsible={{ defaultIsCollapsed: true, hasButton: false }}
      >
        <SideNavSection title="Workspaces" isHeaderHidden>
          <SideNavItem
            label={organizationName}
            icon={Buildings}
            isSelected
            href={discoveryPath}
          />
          <SideNavItem
            label="Create workspace"
            icon={Plus}
            href="/onboarding"
          />
        </SideNavSection>
      </SideNav>
      <Divider orientation="vertical" />
      <SideNav
        header={
          <SideNavHeading
            heading={organizationName}
            headingHref={discoveryPath}
          />
        }
        resizable={{
          defaultWidth: 256,
          minWidth: 220,
          maxWidth: 320,
          autoSaveId: "meld-dashboard-side-nav",
        }}
      >
        <SideNavSection title="Primary" isHeaderHidden>
          <SideNavItem
            label="Home"
            icon={Home}
            href={discoveryPath}
            isSelected={pathname === discoveryPath}
          />
          <SideNavItem label="Search" icon={Search} isDisabled />
          <SideNavItem label="Mentions" icon={At} isDisabled />
          <SideNavItem
            label="Settings"
            icon={Cog}
            href={`/${organizationId}/settings/members`}
            isSelected={pathname.startsWith(
              `/${organizationId}/settings`,
            )}
          />
        </SideNavSection>
        <SideNavSection
          title="Discovery Rooms"
          endContent={
            <IconButton
              label="Create Discovery Room"
              icon={<Icon icon={Plus} />}
              variant="ghost"
              size="sm"
              tooltip="Create Discovery Room"
              onClick={() => router.push(discoveryPath)}
            />
          }
        >
          {rooms.map((room) => (
            <SideNavItem
              key={room.id}
              label={room.name}
              icon={Hashtag}
              href={`${discoveryPath}/${room.id}`}
              isSelected={
                pathname === `${discoveryPath}/${room.id}`
              }
            />
          ))}
        </SideNavSection>
        <SideNavSection
          title="Feature Rooms"
          endContent={
            <IconButton
              label="Create Feature Room"
              icon={<Icon icon={Plus} />}
              variant="ghost"
              size="sm"
              tooltip="Feature Rooms come from accepted PRDs"
              isDisabled
            />
          }
        >
          {null}
        </SideNavSection>
      </SideNav>
    </HStack>
  );
}
```

Use `pathname` to select Home, Settings, or the matching Discovery Room.

- [ ] **Step 4: Run the focused component test**

Run: `pnpm --filter @meld/web test -- src/ui/dashboard-navigation.test.tsx`

Expected: PASS.

### Task 2: Integrate the shell with authenticated room data

**Files:**
- Modify: `apps/web/src/ui/app-frame.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/layout.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx`
- Modify: `apps/web/src/features/discovery/components/room-list.tsx`
- Modify: `e2e/onboarding.spec.ts`
- Modify: `e2e/discovery-room.spec.ts`

**Interfaces:**
- Consumes: `DashboardNavigation` and `listDiscoveryRooms(organizationId)`.
- Produces: The persistent dashboard shell on every authenticated organization route.

- [ ] **Step 1: Let AppFrame receive the complete dual-rail navigation**

```tsx
export function AppFrame({
  navigation,
  children,
}: {
  navigation: ReactNode;
  children: ReactNode;
}) {
  return (
    <AppShell
      height="fill"
      variant="section"
      contentPadding={0}
      sideNav={navigation}
    >
      {children}
    </AppShell>
  );
}
```

- [ ] **Step 2: Load rooms after membership verification**

For both fake and production branches:

```tsx
const rooms = await listDiscoveryRooms(organizationId);

return (
  <AppFrame
    navigation={
      <DashboardNavigation
        organizationId={organizationId}
        organizationName={organization.name}
        rooms={rooms}
      />
    }
  >
    {children}
  </AppFrame>
);
```

Keep the existing unauthenticated redirect and non-member not-found behavior.

- [ ] **Step 3: Refresh the persistent list after room creation**

After `router.push` opens the created room, call `router.refresh()` so the
organization layout reloads `listDiscoveryRooms` and the sidebar grows
immediately.

- [ ] **Step 4: Remove duplicate room-local navigation**

Load only `getDiscoveryRoomPageData({ organizationId, roomId })` in the room
page and remove its `start` `LayoutPanel`. Keep the end inspector panel, header,
conversation, and responsive inspector contract unchanged.

- [ ] **Step 5: Extend the onboarding browser assertion**

After entering the workspace, assert:

```ts
await expect(adminPage.getByText("Home", { exact: true })).toBeVisible();
await expect(
  adminPage.getByText("Discovery Rooms", { exact: true }),
).toBeVisible();
await expect(
  adminPage.getByText("Feature Rooms", { exact: true }),
).toBeVisible();
```

After creating a room, assert its name is visible in the dashboard sidebar.

- [ ] **Step 6: Run complete verification**

Run:

```bash
pnpm --filter @meld/web test
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm check:astryx
pnpm --filter @meld/web build
pnpm exec playwright test e2e/onboarding.spec.ts e2e/discovery-room.spec.ts
```

Expected: all commands pass.

- [ ] **Step 7: Review and commit**

Run:

```bash
git diff --check
git status --short
git add apps/web/src/ui/dashboard-navigation.tsx apps/web/src/ui/dashboard-navigation.test.tsx apps/web/src/ui/app-frame.tsx apps/web/src/ui/app-frame.test.tsx apps/web/src/features/discovery/components/room-list.tsx 'apps/web/src/app/(app)/[organizationId]/layout.tsx' 'apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx' e2e/onboarding.spec.ts e2e/discovery-room.spec.ts docs/superpowers/plans/2026-07-25-main-dashboard-navigation.md
git commit -m "feat: add main dashboard navigation"
```

Expected: dashboard navigation is committed while
`docs/product-feature-checklist.md` remains untracked.

### Task 3: Refine workspace and room navigation identity

**Files:**
- Modify: `apps/web/src/ui/dashboard-navigation.tsx`
- Modify: `apps/web/src/ui/dashboard-navigation.test.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/layout.tsx`
- Modify: `docs/superpowers/specs/2026-07-25-main-dashboard-navigation-design.md`

**Interfaces:**
- Consumes: The organization's nullable `logo_path` from Supabase Storage.
- Produces: `DashboardNavigation` with an optional
  `organizationLogoUrl?: string | null` prop, a logo-with-building-fallback
  workspace item, and icon-bearing room group headers.

- [x] **Step 1: Extend the focused component test**

Pass `organizationLogoUrl="https://example.com/northstar.png"` and assert the
decorative image uses that URL. Assert the Discovery Rooms and Feature Rooms
header icons render and each plus icon has `data-size="xsm"`.

- [x] **Step 2: Run the focused test and verify it fails**

Run:
`pnpm --filter @meld/web test -- src/ui/dashboard-navigation.test.tsx`

Expected: FAIL because the component does not render the logo or room header
icons and the plus glyphs still use the default icon size.

- [x] **Step 3: Implement the refined navigation**

Add a small client-side `OrganizationLogoIcon` that renders the public image
with `--spacing-5` dimensions and `--radius-element`, resets its error state
when the URL changes, and falls back to `Buildings` after an image error.

Compose each room group from Astryx `VStack`, `HStack`, `Text`, `Icon`, and
`IconButton`. Place both groups in a parent `VStack` with token-based top
padding, use `MessageBubbleDots` for Discovery Rooms and `Rocket` for Feature
Rooms, and set the plus `Icon` size to `xsm` while retaining `IconButton`
size `sm`.

- [x] **Step 4: Load the real organization logo URL**

Select `name,logo_path` in the authenticated organization layout. When
`logo_path` is present, call:

```ts
supabase.storage
  .from("organization-logos")
  .getPublicUrl(organization.logo_path).data.publicUrl
```

Pass that URL to `DashboardNavigation`. Keep the fake E2E branch on the
building fallback because it does not persist an uploaded storage object.

- [x] **Step 5: Run verification**

Run:

```bash
pnpm --filter @meld/web test -- src/ui/dashboard-navigation.test.tsx
pnpm --filter @meld/web test
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm check:astryx
pnpm --filter @meld/web build
```

Expected: all commands pass.

- [x] **Step 6: Review and commit**

Run:

```bash
git diff --check
git status --short
git add apps/web/src/ui/dashboard-navigation.tsx apps/web/src/ui/dashboard-navigation.test.tsx 'apps/web/src/app/(app)/[organizationId]/layout.tsx' docs/superpowers/specs/2026-07-25-main-dashboard-navigation-design.md docs/superpowers/plans/2026-07-25-main-dashboard-navigation.md
git commit -m "fix: refine dashboard sidebar navigation"
```

Expected: the refinement is committed while
`docs/product-feature-checklist.md` remains untracked.

### Task 4: Add quiet nested room hierarchy

**Files:**
- Modify: `apps/web/src/ui/dashboard-navigation.tsx`
- Modify: `apps/web/src/ui/dashboard-navigation.test.tsx`
- Modify: `e2e/onboarding.spec.ts`

**Interfaces:**
- Consumes: Existing `DashboardNavigationRoom[]`, pathname selection, Astryx
  `SideNavItem` nesting, and design-system text/icon color tokens.
- Produces: Discovery Room child links indented beneath their parent, with
  compact secondary styling when idle, primary selected styling, and the
  Boxicons `LightBulb` child icon. The same component structure reserves
  `DoorOpen` for future Feature Room children.

- [x] **Step 1: Write the failing hierarchy assertions**

In `dashboard-navigation.test.tsx`, assert that the room link has
`data-size="sm"`, lives inside the Discovery Rooms nested group, renders a
`data-testid="discovery-room-icon"` lightbulb, and is wrapped by the scoped
`meld-room-navigation` Astryx theme. Retain the selected-room assertion.

- [x] **Step 2: Run the focused test and verify it fails**

Run:
`pnpm --filter @meld/web test -- src/ui/dashboard-navigation.test.tsx`

Expected: FAIL because the room still renders as a medium top-level hashtag
item without a nested group or scoped secondary treatment.

- [x] **Step 3: Implement native nesting and scoped contrast**

Define a deterministic module-level Astryx theme named
`meld-room-navigation` with:

```ts
components: {
  "side-nav-item": {
    "size:sm": { color: "var(--color-text-secondary)" },
    selected: { color: "var(--color-text-primary)" },
  },
}
```

Render Discovery Rooms as a non-collapsible parent `SideNavItem` linked to the
Discovery overview, with the existing `MessageBubbleDots` header icon and
compact plus end content. Place the persisted rooms in its `children`, wrap
them with the scoped Astryx `Theme`, set each child to `size="sm"`, and replace
`Hashtag` with `LightBulb`.

Keep Feature Rooms as a sibling header with its `Rocket` section icon and
disabled compact plus action. Use `DoorOpen` for Feature Room children when
that existing empty section receives real route data; do not fabricate routes
or records in this task.

- [x] **Step 4: Run focused verification**

Run:

```bash
pnpm --filter @meld/web test -- src/ui/dashboard-navigation.test.tsx
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm check:astryx
```

Expected: all commands pass.

- [x] **Step 5: Review and commit**

Run:

```bash
git diff --check
git status --short
git add apps/web/src/ui/dashboard-navigation.tsx apps/web/src/ui/dashboard-navigation.test.tsx e2e/onboarding.spec.ts docs/superpowers/plans/2026-07-25-main-dashboard-navigation.md
git commit -m "fix: add nested room navigation hierarchy"
```

Expected: the hierarchy is committed while
`docs/product-feature-checklist.md` remains untracked.

### Task 5: Align room header plus controls

**Files:**
- Modify: `apps/web/src/ui/dashboard-navigation.tsx`

**Interfaces:**
- Consumes: The Feature Rooms `HStack`, its fill `StackItem`, and existing
  disabled `IconButton`.
- Produces: Discovery Rooms and Feature Rooms plus controls sharing the same
  trailing sidebar alignment.

- [x] **Step 1: Apply full-width header layout**

Set `width="100%"` on the outer room-groups `VStack` and the Feature Rooms
`HStack`. The outer width establishes the full sidebar containing block; the
inner width then lets the fill item push the disabled plus action to the
trailing edge. Keep token-based padding, button behavior, and icon sizing
unchanged.

- [x] **Step 2: Review without automated tests**

Run:

```bash
git diff --check
git diff -- apps/web/src/ui/dashboard-navigation.tsx
```

Expected: the component changes only add Astryx width props to the room-groups
stack and Feature header. Automated tests are intentionally skipped at the
user's request because this is decorative.

- [x] **Step 3: Commit**

Run:

```bash
git add apps/web/src/ui/dashboard-navigation.tsx docs/superpowers/plans/2026-07-25-main-dashboard-navigation.md
git commit -m "fix: align room header actions"
```

Expected: the alignment is committed while
`docs/product-feature-checklist.md` remains untracked.
