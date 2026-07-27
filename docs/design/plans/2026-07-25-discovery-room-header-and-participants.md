# Discovery Room Header and Participants Implementation Plan

**Goal:** Replace the Discovery Room inspector with a compact lock-and-title header, a maximum-three-avatar participant popover, and a conversation surface that contrasts with the dashboard navigation.

**Architecture:** Add a focused client `DiscoveryRoomHeader` that combines real room participants with two static UI-only agent roster entries. The server room page removes its end panel and passes existing participant data to the header; semantic background tokens distinguish the content and navigation surfaces without changing the underlying room data model or actions.

**Tech Stack:** Next.js 16 App Router, React 19, Astryx `Avatar`, `AvatarGroup`, `Button`, `Popover`, `List`, `Layout`, Boxicons, Vitest, Testing Library.

## Global Constraints

- Remove the permanent right inspector from the Discovery Room page.
- Render a Boxicons lock, room name, no more than three visible avatars, and a downward chevron in one compact header row.
- Prioritize the current user, Product Agent, and Research Agent in the visible avatar group.
- Show all humans and both agents in the participant popover.
- Product Agent and Research Agent are UI-only and must not create tasks, spend allowance, or post messages.
- Use The Fold and The Lens from the approved Meld mascot family direction as their illustrations.
- Use `var(--color-background-body)` for the room and `var(--color-background-surface)` for dashboard navigation.
- Do not change room authorization, persistence, or participant database tables.
- Do not touch or stage `docs/product-feature-checklist.md`.

---

### Task 1: Build the compact room header and participant popover

**Files:**
- Create: `apps/web/src/features/discovery/components/discovery-room-header.tsx`
- Create: `apps/web/src/features/discovery/discovery-room-header.test.tsx`
- Read asset: `docs/design/specs/assets/meld-mascot-family-concept.png`

**Interfaces:**
- Consumes:

```ts
export type DiscoveryRoomHeaderParticipant = {
  userId: string;
  email: string;
  access: "view" | "edit";
};

export type DiscoveryRoomHeaderProps = {
  roomName: string;
  currentUserId: string;
  participants: DiscoveryRoomHeaderParticipant[];
};
```

- Produces: `DiscoveryRoomHeader(props)` with a lock/title row and a
  light-dismiss participant popover.

- [ ] **Step 1: Write the failing component test**

Stub `matchMedia`, `ResizeObserver`, and the browser Popover API. Render the
header with the current user plus two other humans:

```tsx
render(
  <DiscoveryRoomHeader
    roomName="Customer interviews"
    currentUserId="user-1"
    participants={[
      { userId: "user-1", email: "owner@example.com", access: "edit" },
      { userId: "user-2", email: "maya@example.com", access: "view" },
      { userId: "user-3", email: "sam@example.com", access: "view" },
    ]}
  />,
);
```

Assert:

```ts
expect(
  screen.getByRole("heading", { name: "Customer interviews" }),
).toBeVisible();
expect(screen.getByTestId("private-room-icon")).toBeVisible();
expect(screen.queryByText(/Private to explicit room participants/i))
  .not.toBeInTheDocument();

const trigger = screen.getByRole("button", {
  name: "5 room participants",
});
expect(
  within(screen.getByTestId("visible-room-participants"))
    .getAllByRole("img"),
).toHaveLength(3);

await userEvent.click(trigger);
expect(trigger).toHaveAttribute("aria-expanded", "true");
const popover = screen.getByRole("dialog", {
  name: "Room participants",
});
expect(within(popover).getByText("Product Agent")).toBeVisible();
expect(within(popover).getByText("Research Agent")).toBeVisible();
expect(within(popover).getAllByText("Agent · UI only")).toHaveLength(2);
expect(within(popover).getByText("owner@example.com")).toBeVisible();
expect(within(popover).getByText("maya@example.com")).toBeVisible();
expect(within(popover).getByText("sam@example.com")).toBeVisible();
```

Also assert that the visible group contains the current user, Product Agent,
and Research Agent test IDs in that order.

- [ ] **Step 2: Run the component test and confirm RED**

Run:

```bash
pnpm --filter web exec vitest run \
  src/features/discovery/discovery-room-header.test.tsx
```

Expected: FAIL because `DiscoveryRoomHeader` does not exist.

- [ ] **Step 3: Implement agent portraits from the approved concept**

Statically import:

```ts
import mascotFamilyConcept from
  "../../../../../../docs/design/specs/assets/meld-mascot-family-concept.png";
```

Create an `AgentPortrait` that uses Astryx `Center` as a circular clipping
container and Next `Image` as a 3-by-2 sprite. Use semantic tokens for size,
border, and radius. The Product Agent selects the top-middle cell; the Research
Agent selects the top-end cell:

```tsx
<Center
  role="img"
  aria-label={name}
  width="var(--spacing-6)"
  height="var(--spacing-6)"
  style={{
    border: "var(--border-width) solid var(--color-border)",
    borderRadius: "var(--radius-full)",
    overflow: "hidden",
    position: "relative",
  }}
>
  <Image
    src={mascotFamilyConcept}
    alt=""
    aria-hidden="true"
    style={{
      blockSize: "200%",
      inlineSize: "300%",
      insetBlockStart: 0,
      insetInlineStart: kind === "product" ? "-100%" : "-200%",
      maxInlineSize: "none",
      position: "absolute",
    }}
  />
</Center>
```

Use only the existing approved concept asset; do not create an unrelated
character treatment.

- [ ] **Step 4: Implement roster ordering and the header**

Define static agent entries:

```ts
const AGENTS = [
  {
    id: "agent:product",
    name: "Product Agent",
    description: "Agent · UI only",
    kind: "product",
  },
  {
    id: "agent:research",
    name: "Research Agent",
    description: "Agent · UI only",
    kind: "research",
  },
] as const;
```

Build visible entries from current human, both agents, then remaining humans,
deduplicate by ID, and call `.slice(0, 3)`. Build the complete popover roster
from both agents followed by all humans.

Use:

```tsx
<HStack gap={3} hAlign="between" vAlign="center" width="100%">
  <HStack gap={2} vAlign="center">
    <Icon
      icon={Lock}
      size="sm"
      color="secondary"
      data-testid="private-room-icon"
    />
    <Heading level={3} accessibilityLevel={1}>
      {roomName}
    </Heading>
  </HStack>
  <Popover
    label="Room participants"
    placement="below"
    alignment="end"
    width="calc(var(--spacing-12) * 6)"
    content={participantList}
  >
    <Button
      label={`${fullRoster.length} room participants`}
      variant="ghost"
      size="md"
    >
      <HStack gap={1} vAlign="center">
        <AvatarGroup
          size="sm"
          data-testid="visible-room-participants"
        >
          {visibleEntries}
        </AvatarGroup>
        <Icon icon={ChevronDown} size="xsm" color="secondary" />
      </HStack>
    </Button>
  </Popover>
</HStack>
```

The popover content uses `VStack`, `Heading`, `List`, and `ListItem`. Humans
use `Avatar name={email}` and an access description; agents use
`AgentPortrait`.

- [ ] **Step 5: Run the component test and confirm GREEN**

Run:

```bash
pnpm --filter web exec vitest run \
  src/features/discovery/discovery-room-header.test.tsx
```

Expected: all header tests pass.

- [ ] **Step 6: Commit the header component**

```bash
git add apps/web/src/features/discovery/components/discovery-room-header.tsx \
  apps/web/src/features/discovery/discovery-room-header.test.tsx
git commit -m "feat: add discovery room participant header"
```

### Task 2: Remove the inspector and separate room surfaces

**Files:**
- Modify: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx`
- Create: `apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx`
- Modify: `apps/web/src/ui/dashboard-navigation.tsx`
- Modify: `apps/web/src/ui/dashboard-navigation.test.tsx`

**Interfaces:**
- Consumes: `DiscoveryRoomHeader` from Task 1 and the existing
  `getDiscoveryRoomPageData()` return value.
- Produces: a full-width conversation layout without `LayoutPanel` or
  `RoomInspector`.

- [ ] **Step 1: Write the failing page-layout tests**

Mock `getDiscoveryRoomPageData`, `DiscoveryRoomHeader`, and `Conversation`.
Render the awaited server page result. Assert:

```ts
expect(screen.queryByLabelText("Room details")).not.toBeInTheDocument();
expect(screen.getByTestId("discovery-room-header")).toHaveTextContent(
  "Customer interviews",
);
expect(screen.getByTestId("discovery-room-surface")).toHaveStyle({
  backgroundColor: "var(--color-background-body)",
});
```

Extend the existing dashboard-navigation test:

```ts
expect(screen.getByTestId("dashboard-navigation")).toHaveStyle({
  backgroundColor: "var(--color-background-surface)",
});
```

- [ ] **Step 2: Run the page and navigation tests and confirm RED**

Run:

```bash
pnpm --filter web exec vitest run \
  "src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx" \
  src/ui/dashboard-navigation.test.tsx
```

Expected: the page still renders `Room details`, the new header is absent, and
the semantic surface styles are missing.

- [ ] **Step 3: Replace the page inspector and header**

Remove `LayoutPanel`, `RoomInspector`, `Text`, and the fake attachment flag
from the room page. Render:

```tsx
<Layout
  height="fill"
  style={{ backgroundColor: "var(--color-background-body)" }}
  header={
    <LayoutHeader
      hasDivider
      padding={3}
      style={{ backgroundColor: "var(--color-background-body)" }}
    >
      <DiscoveryRoomHeader
        roomName={data.room.name}
        currentUserId={data.currentUser.id}
        participants={data.participants}
      />
    </LayoutHeader>
  }
>
  <LayoutContent
    padding={0}
    data-testid="discovery-room-surface"
    style={{ backgroundColor: "var(--color-background-body)" }}
  >
    <Conversation
      roomId={roomId}
      currentUserId={data.currentUser.id}
      currentUserName={data.currentUser.name}
      initialMessages={data.messages}
      realtimeMode={
        isDiscoveryFakeEnabled()
          ? "development-poll"
          : "production"
      }
    />
  </LayoutContent>
</Layout>
```

- [ ] **Step 4: Give dashboard navigation its surface**

Add `data-testid="dashboard-navigation"` and:

```ts
style={{
  backgroundColor: "var(--color-background-surface)",
}}
```

to the outer `HStack` in `DashboardNavigation`.

- [ ] **Step 5: Run focused tests and confirm GREEN**

Run:

```bash
pnpm --filter web exec vitest run \
  "src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx" \
  src/features/discovery/discovery-room-header.test.tsx \
  src/ui/dashboard-navigation.test.tsx \
  src/features/discovery/conversation.test.tsx
```

Expected: all tests pass.

- [ ] **Step 6: Commit the room layout**

```bash
git add \
  "apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.tsx" \
  "apps/web/src/app/(app)/[organizationId]/discovery/[roomId]/page.test.tsx" \
  apps/web/src/ui/dashboard-navigation.tsx \
  apps/web/src/ui/dashboard-navigation.test.tsx
git commit -m "fix: focus discovery room conversation layout"
```

### Task 3: Record deferred functional agent work in the original MVP plan

**Files:**
- Modify: `docs/design/plans/2026-07-24-personal-ai-product-lifecycle-mvp.md`
- Include: `docs/design/plans/2026-07-25-discovery-room-header-and-participants.md`

**Interfaces:**
- Consumes: Task 10's existing Product Agent task architecture.
- Produces: an explicit deferred activation requirement for Product Agent and
  Research Agent that preserves explicit-invocation-only model usage.

- [ ] **Step 1: Add the deferred roster-to-runtime requirements**

In Task 10, expand the title to
`Add Mention-Triggered Product and Research Agents`, add Research Agent prompt
and test files, and add these requirements:

```md
- The Discovery Room roster may show Product Agent and Research Agent before
  runtime activation, but both must remain labelled `Agent · UI only`.
- Functional activation replaces UI-only status with real availability derived
  from the initiating user's connected provider and device.
- Product Agent and Research Agent use separate role-specific prompts and their
  approved Fold and Lens illustrations.
- Automatic roster presence never creates a task or consumes provider
  allowance. Both agents run only after an explicit mention or action.
```

Add trigger coverage:

```ts
it.each(["product", "research"])(
  "does not create an %s agent task from roster presence alone",
  async (agent) => {
    await openRoomWithAgentInRoster(agent);
    expect(taskRepository.insert).not.toHaveBeenCalled();
  },
);
```

- [ ] **Step 2: Check the plan for consistency**

Run:

```bash
grep -nE "Product Agent|Research Agent|UI only|explicit" \
  docs/design/plans/2026-07-24-personal-ai-product-lifecycle-mvp.md
git diff --check
```

Expected: both agents, their UI-only boundary, and their explicit activation
rule are present without placeholders or whitespace errors.

- [ ] **Step 3: Run the complete quality checks**

Run:

```bash
pnpm --filter web test
pnpm --filter web typecheck
pnpm --filter web lint
pnpm check:astryx
git diff --check
```

Expected: every command passes.

- [ ] **Step 4: Browser smoke-check**

Open a Discovery Room at desktop width and verify:

- No right inspector is present.
- Header shows lock, room name, three avatars, and chevron.
- Popover shows every human plus Product Agent and Research Agent.
- The conversation surface is visibly distinct from the left navigation.
- The header remains usable when the popover opens and closes.

- [ ] **Step 5: Commit the plan follow-up**

```bash
git add docs/design/plans/2026-07-24-personal-ai-product-lifecycle-mvp.md \
  docs/design/plans/2026-07-25-discovery-room-header-and-participants.md
git commit -m "docs: track discovery room agent activation"
```
