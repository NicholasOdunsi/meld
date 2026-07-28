# Workspace Switcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let a user who belongs to more than one workspace switch between them from the workspace rail, instead of the rail only ever showing the current workspace's logo.

**Architecture:** A new `listUserWorkspaces()` method on the existing `WorkspaceBackend` interface returns every workspace a user belongs to, ordered oldest-membership-first. The `[organizationId]` layout fetches that list alongside its existing data and passes it to `DashboardNavigation`, which renders the rail's icons from the list (instead of a single hardcoded item) using Astryx `SideNav`'s native scrollable-content and sticky-`footerIcons` zones, with each icon tooltipped via Astryx `Tooltip`.

**Tech Stack:** Next.js App Router, React, TypeScript, Astryx Design System, Supabase, Vitest, Testing Library, Playwright

## Global Constraints

- The workspace rail lists every workspace the signed-in user belongs to, ordered by `memberships.created_at` ascending (oldest first) — the same rule root routing already uses to pick a default workspace.
- Clicking a workspace's logo navigates to `/<organization-id>` (its home).
- "Create workspace" stays pinned at the bottom of the rail via Astryx `SideNav`'s `footerIcons` slot; the workspace list scrolls independently above it via `SideNav`'s native scrollable `children` zone.
- Each workspace icon shows a hover tooltip with its name via Astryx `Tooltip` (`placement="end"`).
- No database schema or migration changes — `memberships` + `organizations` + existing RLS already support this.
- No changes to root routing (`/`) or its default-workspace selection.
- Use Astryx components only; no raw `<div>`/hardcoded colors or pixel values (repo-wide rule, see `AGENTS.md`).

---

### Task 1: `listUserWorkspaces` on both workspace backends

**Files:**
- Modify: `apps/web/src/features/workspaces/backend.ts`
- Modify: `apps/web/src/features/workspaces/e2e-fake.ts`
- Modify: `apps/web/src/features/workspaces/fake-backend.ts`
- Modify: `apps/web/src/features/workspaces/supabase-backend.ts`
- Test: `apps/web/src/features/workspaces/e2e-fake.test.ts`
- Test: `apps/web/src/features/workspaces/supabase-backend.test.ts` (new file)

**Interfaces:**
- Consumes: nothing new; uses the existing `getFakeUser()`, `getStore()` in `e2e-fake.ts` and `createClient()` from `@/lib/supabase/server` in `supabase-backend.ts`.
- Produces: `WorkspaceSummary = { organizationId: string; organizationName: string; organizationLogoUrl: string | null }` and `WorkspaceBackend.listUserWorkspaces(): Promise<WorkspaceSummary[]>`, consumed by Task 2's layout and UI changes.

- [ ] **Step 1: Write the failing fake-backend test**

Add to `apps/web/src/features/workspaces/e2e-fake.test.ts` — extend the existing import and add a second `describe` block after the existing one:

```ts
import {
  fakeCreateOrganization,
  fakeInviteMember,
  fakeRevokeInvitation,
  listFakeOrganizationPeople,
  listFakeUserWorkspaces,
} from "./e2e-fake";
```

```ts
describe("workspace E2E fake workspace listing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-25T12:00:00.000Z"));
    vi.stubEnv("MELD_E2E_FAKE_WORKSPACES", "true");
    const values: Record<string, string> = {
      "meld-e2e-user-id": "20000000-0000-4000-8000-000000000002",
      "meld-e2e-user-email": "switcher@example.com",
      "meld-e2e-user-name": "Switcher Example",
    };
    mocks.cookies.mockResolvedValue({
      get(name: string) {
        const value = values[name];
        return value ? { value } : undefined;
      },
    });
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  it("orders a member's workspaces oldest-membership-first", async () => {
    const first = await fakeCreateOrganization({
      name: "Northstar",
      productName: "Mobile app",
    });
    vi.advanceTimersByTime(1000);
    const second = await fakeCreateOrganization({
      name: "Basecamp",
      productName: "Web app",
    });

    await expect(listFakeUserWorkspaces()).resolves.toEqual([
      {
        organizationId: first.organizationId,
        organizationName: "Northstar",
        organizationLogoUrl: null,
      },
      {
        organizationId: second.organizationId,
        organizationName: "Basecamp",
        organizationLogoUrl: null,
      },
    ]);
  });

  it("returns no workspaces for a signed-out caller", async () => {
    mocks.cookies.mockResolvedValue({
      get() {
        return undefined;
      },
    });

    await expect(listFakeUserWorkspaces()).resolves.toEqual([]);
  });
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @meld/web test -- src/features/workspaces/e2e-fake.test.ts`

Expected: FAIL — `listFakeUserWorkspaces` is not exported from `./e2e-fake`.

- [ ] **Step 3: Implement `listFakeUserWorkspaces`**

Add to `apps/web/src/features/workspaces/e2e-fake.ts`, after `getFakeOrganizationContext` (around line 357):

```ts
export async function listFakeUserWorkspaces() {
  const user = await getFakeUser();
  if (!user) {
    return [];
  }
  const store = getStore();
  return store.memberships
    .filter((membership) => membership.userId === user.id)
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt))
    .map((membership) => {
      const organization = store.organizations.get(
        membership.organizationId,
      );
      return {
        organizationId: membership.organizationId,
        organizationName: organization?.name ?? "",
        // No object storage behind the fake, so no logo to link to.
        organizationLogoUrl: null,
      };
    });
}
```

- [ ] **Step 4: Run it again and confirm it passes**

Run: `pnpm --filter @meld/web test -- src/features/workspaces/e2e-fake.test.ts`

Expected: PASS, including the pre-existing invitation-lifecycle test.

- [ ] **Step 5: Write the failing Supabase-backend test**

Create `apps/web/src/features/workspaces/supabase-backend.test.ts`:

```ts
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  getUser: vi.fn(),
  from: vi.fn(),
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  storageFrom: vi.fn(),
  getPublicUrl: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

import { createSupabaseWorkspaceBackend } from "./supabase-backend";

describe("listUserWorkspaces", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.createClient.mockResolvedValue({
      auth: { getUser: mocks.getUser },
      from: mocks.from,
      storage: { from: mocks.storageFrom },
    });
    mocks.from.mockReturnValue({ select: mocks.select });
    mocks.select.mockReturnValue({ eq: mocks.eq });
    mocks.eq.mockReturnValue({ order: mocks.order });
    mocks.storageFrom.mockReturnValue({ getPublicUrl: mocks.getPublicUrl });
  });

  it("orders workspaces oldest-membership-first and resolves logo URLs", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: { id: "user-1" } } });
    mocks.order.mockResolvedValue({
      data: [
        {
          organizations: {
            id: "org-1",
            name: "Northstar",
            logo_path: "user-1/northstar.png",
          },
        },
        {
          organizations: { id: "org-2", name: "Basecamp", logo_path: null },
        },
      ],
      error: null,
    });
    mocks.getPublicUrl.mockReturnValue({
      data: { publicUrl: "https://example.com/northstar.png" },
    });

    const backend = createSupabaseWorkspaceBackend();
    const workspaces = await backend.listUserWorkspaces();

    expect(mocks.from).toHaveBeenCalledWith("memberships");
    expect(mocks.eq).toHaveBeenCalledWith("user_id", "user-1");
    expect(mocks.order).toHaveBeenCalledWith("created_at", {
      ascending: true,
    });
    expect(workspaces).toEqual([
      {
        organizationId: "org-1",
        organizationName: "Northstar",
        organizationLogoUrl: "https://example.com/northstar.png",
      },
      {
        organizationId: "org-2",
        organizationName: "Basecamp",
        organizationLogoUrl: null,
      },
    ]);
  });

  it("returns no workspaces for a signed-out caller", async () => {
    mocks.getUser.mockResolvedValue({ data: { user: null } });

    const backend = createSupabaseWorkspaceBackend();
    await expect(backend.listUserWorkspaces()).resolves.toEqual([]);
    expect(mocks.from).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 6: Run it and confirm it fails**

Run: `pnpm --filter @meld/web test -- src/features/workspaces/supabase-backend.test.ts`

Expected: FAIL — `backend.listUserWorkspaces` is not a function.

- [ ] **Step 7: Implement `listUserWorkspaces` on the Supabase backend and the shared type**

Add to `apps/web/src/features/workspaces/backend.ts`, after the `OrganizationShell` type (around line 80):

```ts
export type WorkspaceSummary = {
  organizationId: string;
  organizationName: string;
  organizationLogoUrl: string | null;
};
```

Add to the `WorkspaceBackend` type, right after `getCurrentUserId(): Promise<string | null>;`:

```ts
  listUserWorkspaces(): Promise<WorkspaceSummary[]>;
```

Add to `apps/web/src/features/workspaces/supabase-backend.ts`, inside the object returned by `createSupabaseWorkspaceBackend`, right after `getCurrentUserId` (around line 262) — and add the `WorkspaceMembershipRow` type above `createSupabaseWorkspaceBackend`:

```ts
type WorkspaceMembershipRow = {
  organizations: {
    id: string;
    name: string;
    logo_path: string | null;
  };
};
```

```ts
    async listUserWorkspaces() {
      const supabase = await createClient(new Headers());
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (!user) return [];

      const { data, error } = await supabase
        .from("memberships")
        .select("organizations(id,name,logo_path)")
        .eq("user_id", user.id)
        .order("created_at", { ascending: true });

      if (error) {
        throw new Error("We could not load your workspaces.");
      }

      return ((data ?? []) as WorkspaceMembershipRow[]).map((row) => ({
        organizationId: row.organizations.id,
        organizationName: row.organizations.name,
        organizationLogoUrl: row.organizations.logo_path
          ? supabase.storage
              .from(ORGANIZATION_LOGO_PUBLIC_BUCKET)
              .getPublicUrl(row.organizations.logo_path).data.publicUrl
          : null,
      }));
    },
```

Add to `apps/web/src/features/workspaces/fake-backend.ts`: import `listFakeUserWorkspaces` alongside the other named imports from `./e2e-fake`, and add the method right after `getCurrentUserId`:

```ts
    async listUserWorkspaces() {
      return listFakeUserWorkspaces();
    },
```

- [ ] **Step 8: Run both tests again and confirm they pass**

Run: `pnpm --filter @meld/web test -- src/features/workspaces/supabase-backend.test.ts src/features/workspaces/e2e-fake.test.ts`

Expected: PASS.

- [ ] **Step 9: Run the full workspace test suite and typecheck**

Run:

```bash
pnpm --filter @meld/web test -- src/features/workspaces
pnpm --filter @meld/web typecheck
```

Expected: all pass — both `WorkspaceBackend` implementations now satisfy the interface.

- [ ] **Step 10: Commit**

```bash
git add apps/web/src/features/workspaces/backend.ts apps/web/src/features/workspaces/e2e-fake.ts apps/web/src/features/workspaces/e2e-fake.test.ts apps/web/src/features/workspaces/fake-backend.ts apps/web/src/features/workspaces/supabase-backend.ts apps/web/src/features/workspaces/supabase-backend.test.ts
git commit -m "feat: add listUserWorkspaces to the workspace backend"
```

---

### Task 2: Render every workspace in the rail

**Files:**
- Modify: `apps/web/src/ui/dashboard-navigation.tsx`
- Modify: `apps/web/src/app/(app)/[organizationId]/layout.tsx`
- Modify: `apps/web/src/features/workspaces/backend.ts`
- Modify: `apps/web/src/features/workspaces/supabase-backend.ts`
- Modify: `apps/web/src/features/workspaces/fake-backend.ts`
- Test: `apps/web/src/ui/dashboard-navigation.test.tsx`

**Interfaces:**
- Consumes: `WorkspaceBackend.listUserWorkspaces()` and `WorkspaceSummary` from Task 1.
- Produces: `DashboardNavigation`'s new `workspaces: DashboardNavigationWorkspace[]` prop (`DashboardNavigationWorkspace = { id: string; name: string; logoUrl: string | null }`), and drops its old `organizationLogoUrl` prop.

- [ ] **Step 1: Update the component test to expect a workspace list**

Replace the full contents of `apps/web/src/ui/dashboard-navigation.test.tsx` with:

```tsx
// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from "@testing-library/react";
import { userEvent } from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";
const SECOND_ORGANIZATION_ID = "60000000-0000-4000-8000-000000000006";
const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => `/${ORGANIZATION_ID}/discovery/${ROOM_ID}`,
  useRouter: () => ({
    push: mocks.push,
    refresh: mocks.refresh,
  }),
}));

import { DashboardNavigation } from "./dashboard-navigation";

const SINGLE_WORKSPACE = [
  { id: ORGANIZATION_ID, name: "Northstar", logoUrl: null },
];

afterEach(() => {
  cleanup();
  mocks.push.mockClear();
  mocks.refresh.mockClear();
});

it("renders workspace, primary, discovery, and feature navigation", () => {
  render(
    <DashboardNavigation
      organizationId={ORGANIZATION_ID}
      organizationName="Northstar"
      workspaces={[
        {
          id: ORGANIZATION_ID,
          name: "Northstar",
          logoUrl: "https://example.com/northstar.png",
        },
      ]}
      currentUserId={OWNER_ID}
      rooms={[
        {
          id: ROOM_ID,
          name: "Customer interviews",
          ownerId: OWNER_ID,
        },
      ]}
    />,
  );

  expect(screen.getAllByText("Northstar").length).toBeGreaterThan(0);
  expect(screen.getByTestId("dashboard-navigation")).toHaveStyle({
    backgroundColor: "var(--color-background-surface)",
  });
  expect(screen.getByTestId("organization-logo")).toHaveAttribute(
    "src",
    "https://example.com/northstar.png",
  );
  expect(screen.getByText("Home")).toBeVisible();
  expect(screen.getByText("Search")).toBeVisible();
  expect(screen.getByText("Mentions")).toBeVisible();
  expect(screen.getByText("Settings")).toBeVisible();
  expect(
    screen.getByText("Search").closest('[aria-disabled="true"]'),
  ).not.toBeNull();
  expect(
    screen.getByText("Mentions").closest('[aria-disabled="true"]'),
  ).not.toBeNull();

  const workspaceRail = screen.getByTestId("workspace-rail");
  const currentWorkspaceLink = within(workspaceRail).getByRole("link", {
    name: "Northstar",
  });
  expect(currentWorkspaceLink).toHaveAttribute("href", `/${ORGANIZATION_ID}`);
  expect(currentWorkspaceLink).toHaveAttribute("aria-current", "page");
  expect(
    within(workspaceRail).getByRole("link", { name: "Create workspace" }),
  ).toHaveAttribute("href", "/onboarding");
  const discoveryRoomLink = screen.getByRole("link", {
    name: "Customer interviews",
  });
  expect(discoveryRoomLink).toHaveAttribute(
    "href",
    `/${ORGANIZATION_ID}/discovery/${ROOM_ID}`,
  );
  expect(discoveryRoomLink).toHaveAttribute("aria-current", "page");
  expect(discoveryRoomLink).toHaveAttribute("data-size", "sm");
  expect(
    discoveryRoomLink.closest('[data-astryx-theme="meld-room-navigation"]'),
  ).not.toBeNull();
  expect(screen.getByTestId("discovery-room-icon")).toBeVisible();

  expect(screen.getByRole("link", { name: "Discovery Rooms" })).toBeVisible();
  expect(screen.getByText("Feature Rooms")).toBeVisible();
  expect(screen.getByTestId("discovery-rooms-icon")).toBeVisible();
  expect(screen.getByTestId("feature-rooms-icon")).toBeVisible();
  expect(screen.getByTestId("create-discovery-room-icon")).toHaveAttribute(
    "data-size",
    "xsm",
  );
  expect(screen.getByTestId("create-feature-room-icon")).toHaveAttribute(
    "data-size",
    "xsm",
  );
  expect(screen.getAllByRole("navigation")).toHaveLength(2);
  const resizeHandle = screen.getByTestId("astryx-sidenav-resize-handle");
  expect(resizeHandle).toHaveAttribute("aria-valuemin", "220");
  expect(resizeHandle).toHaveAttribute("aria-valuenow", "256");
  expect(resizeHandle).toHaveAttribute("aria-valuemax", "320");
  expect(
    screen.getByRole("button", { name: "Create Feature Room" }),
  ).toHaveAttribute("aria-disabled", "true");
  expect(
    screen.getByRole("button", { name: "Create Discovery Room" }),
  ).not.toHaveAttribute("aria-disabled", "true");
});

it("lists every workspace in the rail, ordered as given, with only the current one selected", () => {
  render(
    <DashboardNavigation
      organizationId={ORGANIZATION_ID}
      organizationName="Northstar"
      workspaces={[
        { id: ORGANIZATION_ID, name: "Northstar", logoUrl: null },
        { id: SECOND_ORGANIZATION_ID, name: "Basecamp", logoUrl: null },
      ]}
      currentUserId={OWNER_ID}
      rooms={[]}
    />,
  );

  const workspaceRail = screen.getByTestId("workspace-rail");
  const workspaceLinks = within(workspaceRail).getAllByRole("link", {
    name: /Northstar|Basecamp/,
  });
  expect(workspaceLinks.map((link) => link.textContent)).toEqual([
    "Northstar",
    "Basecamp",
  ]);
  expect(workspaceLinks[0]).toHaveAttribute("href", `/${ORGANIZATION_ID}`);
  expect(workspaceLinks[0]).toHaveAttribute("aria-current", "page");
  expect(workspaceLinks[1]).toHaveAttribute(
    "href",
    `/${SECOND_ORGANIZATION_ID}`,
  );
  expect(workspaceLinks[1]).not.toHaveAttribute("aria-current");
});

it("shows a workspace's name in a tooltip on hover", async () => {
  const user = userEvent.setup();
  render(
    <DashboardNavigation
      organizationId={ORGANIZATION_ID}
      organizationName="Northstar"
      workspaces={[
        { id: ORGANIZATION_ID, name: "Northstar", logoUrl: null },
        { id: SECOND_ORGANIZATION_ID, name: "Basecamp", logoUrl: null },
      ]}
      currentUserId={OWNER_ID}
      rooms={[]}
    />,
  );

  const workspaceRail = screen.getByTestId("workspace-rail");
  await user.hover(
    within(workspaceRail).getByRole("link", { name: "Basecamp" }),
  );

  expect(await screen.findByRole("tooltip")).toHaveTextContent("Basecamp");
});

it("links Home to the organization root", () => {
  render(
    <DashboardNavigation
      organizationId={ORGANIZATION_ID}
      organizationName="Northstar"
      workspaces={SINGLE_WORKSPACE}
      currentUserId={OWNER_ID}
      rooms={[]}
    />,
  );

  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
    "href",
    `/${ORGANIZATION_ID}`,
  );
});

it("opens the room-creation dialog directly from the Discovery Rooms plus button", async () => {
  const user = userEvent.setup();
  render(
    <DashboardNavigation
      organizationId={ORGANIZATION_ID}
      organizationName="Northstar"
      workspaces={SINGLE_WORKSPACE}
      currentUserId={OWNER_ID}
      rooms={[]}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Create Discovery Room" }),
  );

  expect(
    await screen.findByRole("heading", { name: "Create Discovery Room" }),
  ).toBeVisible();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("only reveals a room's options trigger on hover or focus", () => {
  render(
    <DashboardNavigation
      organizationId={ORGANIZATION_ID}
      organizationName="Northstar"
      workspaces={SINGLE_WORKSPACE}
      currentUserId={OWNER_ID}
      rooms={[{ id: ROOM_ID, name: "Customer interviews", ownerId: OWNER_ID }]}
    />,
  );

  const menuButton = screen.getByRole("button", {
    name: "Customer interviews options",
  });
  const opacityWrapper = menuButton.closest(
    "div[style*='opacity']",
  ) as HTMLElement;
  const row = opacityWrapper.parentElement as HTMLElement;

  expect(opacityWrapper).toHaveStyle({ opacity: "0" });
  fireEvent.mouseEnter(row);
  expect(opacityWrapper).toHaveStyle({ opacity: "1" });
  fireEvent.mouseLeave(row);
  expect(opacityWrapper).toHaveStyle({ opacity: "0" });
});

it("only offers Delete Room to the room's owner", async () => {
  const user = userEvent.setup();
  const otherOwnerId = "10000000-0000-4000-8000-000000000002";
  render(
    <DashboardNavigation
      organizationId={ORGANIZATION_ID}
      organizationName="Northstar"
      workspaces={SINGLE_WORKSPACE}
      currentUserId={OWNER_ID}
      rooms={[
        {
          id: ROOM_ID,
          name: "Customer interviews",
          ownerId: otherOwnerId,
        },
      ]}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Customer interviews options" }),
  );

  expect(
    screen.getByRole("menuitem", {
      name: "Move to Feature Room",
      hidden: true,
    }),
  ).toBeVisible();
  expect(
    screen.queryByRole("menuitem", { name: "Delete Room", hidden: true }),
  ).not.toBeInTheDocument();
});

it("opens a simple confirm dialog before deleting a room", async () => {
  const user = userEvent.setup();
  render(
    <DashboardNavigation
      organizationId={ORGANIZATION_ID}
      organizationName="Northstar"
      workspaces={SINGLE_WORKSPACE}
      currentUserId={OWNER_ID}
      rooms={[{ id: ROOM_ID, name: "Customer interviews", ownerId: OWNER_ID }]}
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Customer interviews options" }),
  );
  expect(
    within(screen.getByRole("menu", { hidden: true })).queryByRole(
      "separator",
      { hidden: true },
    ),
  ).not.toBeInTheDocument();
  await user.click(
    screen.getByRole("menuitem", { name: "Delete Room", hidden: true }),
  );

  expect(screen.getByRole("heading", { name: "Delete room" })).toBeVisible();
  expect(
    screen.getByText(
      "This permanently deletes everything in the room. This can't be undone.",
    ),
  ).toBeVisible();
  expect(screen.getByRole("button", { name: "Delete room" })).toBeVisible();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm --filter @meld/web test -- src/ui/dashboard-navigation.test.tsx`

Expected: FAIL — `workspaces` is not a recognized prop shape yet and the rail still renders only the old two hardcoded items, so the new assertions (multi-workspace list, tooltip) find nothing.

- [ ] **Step 3: Drop the now-dead `organizationLogoUrl` field from `OrganizationShell`**

In `apps/web/src/features/workspaces/backend.ts`, change:

```ts
export type OrganizationShell = {
  currentUserId: string;
  organizationName: string;
  organizationLogoUrl: string | null;
};
```

to:

```ts
export type OrganizationShell = {
  currentUserId: string;
  organizationName: string;
};
```

In `apps/web/src/features/workspaces/supabase-backend.ts`, change the `getOrganizationShell` implementation's organization query and return value from:

```ts
    supabase
      .from("organizations")
      .select("name,logo_path")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);
  const organization = organizationResult.data;
  if (!membershipResult.data || !organization) {
    return { status: "not-a-member" };
  }

  return {
    status: "ok",
    data: {
      currentUserId: user.id,
      organizationName: organization.name,
      organizationLogoUrl: organization.logo_path
        ? supabase.storage
            .from(ORGANIZATION_LOGO_PUBLIC_BUCKET)
            .getPublicUrl(organization.logo_path).data.publicUrl
        : null,
    },
  };
},
```

to:

```ts
    supabase
      .from("organizations")
      .select("name")
      .eq("id", organizationId)
      .maybeSingle(),
  ]);
  const organization = organizationResult.data;
  if (!membershipResult.data || !organization) {
    return { status: "not-a-member" };
  }

  return {
    status: "ok",
    data: {
      currentUserId: user.id,
      organizationName: organization.name,
    },
  };
},
```

In `apps/web/src/features/workspaces/fake-backend.ts`, remove the `organizationLogoUrl: null,` line (and its preceding comment) from `getOrganizationShell`'s return value.

- [ ] **Step 4: Update `DashboardNavigation` to render the workspace list**

In `apps/web/src/ui/dashboard-navigation.tsx`, add the `Tooltip` import next to the other `@astryxdesign/core` imports:

```ts
import { Tooltip } from "@astryxdesign/core/Tooltip";
```

Add a new exported type next to `DashboardNavigationRoom`:

```ts
export type DashboardNavigationWorkspace = {
  id: string;
  name: string;
  logoUrl: string | null;
};
```

Change the component's prop list from:

```ts
export function DashboardNavigation({
  organizationId,
  organizationName,
  organizationLogoUrl,
  currentUserId,
  rooms,
}: {
  organizationId: string;
  organizationName: string;
  organizationLogoUrl?: string | null;
  currentUserId: string;
  rooms: DashboardNavigationRoom[];
}) {
```

to:

```ts
export function DashboardNavigation({
  organizationId,
  organizationName,
  workspaces,
  currentUserId,
  rooms,
}: {
  organizationId: string;
  organizationName: string;
  workspaces: DashboardNavigationWorkspace[];
  currentUserId: string;
  rooms: DashboardNavigationRoom[];
}) {
```

Replace the rail's `SideNav` (the one with `data-testid="workspace-rail"`) from:

```tsx
      <SideNav
        collapsible={{
          defaultIsCollapsed: true,
          hasButton: false,
        }}
        data-testid="workspace-rail"
      >
        <SideNavSection title="Workspaces" isHeaderHidden>
          <SideNavItem
            label={organizationName}
            icon={
              <OrganizationLogoIcon logoUrl={organizationLogoUrl} />
            }
            isSelected
            href={homePath}
          />
          <SideNavItem
            label="Create workspace"
            icon={Plus}
            href="/onboarding"
          />
        </SideNavSection>
      </SideNav>
```

to:

```tsx
      <SideNav
        collapsible={{
          defaultIsCollapsed: true,
          hasButton: false,
        }}
        data-testid="workspace-rail"
        footerIcons={
          <Tooltip content="Create workspace" placement="end">
            <SideNavItem
              label="Create workspace"
              icon={Plus}
              href="/onboarding"
            />
          </Tooltip>
        }
      >
        <SideNavSection title="Workspaces" isHeaderHidden>
          {workspaces.map((workspace) => (
            <Tooltip
              key={workspace.id}
              content={workspace.name}
              placement="end"
            >
              <SideNavItem
                label={workspace.name}
                icon={<OrganizationLogoIcon logoUrl={workspace.logoUrl} />}
                isSelected={workspace.id === organizationId}
                href={`/${workspace.id}`}
              />
            </Tooltip>
          ))}
        </SideNavSection>
      </SideNav>
```

- [ ] **Step 5: Update the layout to fetch and pass the workspace list**

In `apps/web/src/app/(app)/[organizationId]/layout.tsx`, change:

```tsx
  const rooms = await listDiscoveryRooms(organizationId);

  return (
    <AppFrame
      navigation={
        <DashboardNavigation
          organizationId={organizationId}
          organizationName={access.data.organizationName}
          organizationLogoUrl={access.data.organizationLogoUrl}
          currentUserId={access.data.currentUserId}
          rooms={rooms}
        />
      }
    >
      {children}
    </AppFrame>
  );
}
```

to:

```tsx
  const [rooms, workspaces] = await Promise.all([
    listDiscoveryRooms(organizationId),
    backend.listUserWorkspaces(),
  ]);

  return (
    <AppFrame
      navigation={
        <DashboardNavigation
          organizationId={organizationId}
          organizationName={access.data.organizationName}
          workspaces={workspaces.map((workspace) => ({
            id: workspace.organizationId,
            name: workspace.organizationName,
            logoUrl: workspace.organizationLogoUrl,
          }))}
          currentUserId={access.data.currentUserId}
          rooms={rooms}
        />
      }
    >
      {children}
    </AppFrame>
  );
}
```

- [ ] **Step 6: Run the component test again and confirm it passes**

Run: `pnpm --filter @meld/web test -- src/ui/dashboard-navigation.test.tsx`

Expected: PASS.

- [ ] **Step 7: Run the full check suite**

Run:

```bash
pnpm --filter @meld/web test
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm check:astryx
pnpm --filter @meld/web build
```

Expected: all pass.

- [ ] **Step 8: Commit**

```bash
git add apps/web/src/ui/dashboard-navigation.tsx apps/web/src/ui/dashboard-navigation.test.tsx apps/web/src/app/\(app\)/\[organizationId\]/layout.tsx apps/web/src/features/workspaces/backend.ts apps/web/src/features/workspaces/supabase-backend.ts apps/web/src/features/workspaces/fake-backend.ts
git commit -m "feat: render every workspace in the rail with tooltips"
```

---

### Task 3: End-to-end coverage for switching workspaces

**Files:**
- Create: `e2e/workspace-switcher.spec.ts`

**Interfaces:**
- Consumes: the onboarding flow (`/onboarding`, invite step, setup interstitial) unchanged from Task 2, and the rail's `data-testid="workspace-rail"` from Task 2.
- Produces: nothing consumed elsewhere; this is the plan's final verification layer.

- [ ] **Step 1: Write the end-to-end test**

Create `e2e/workspace-switcher.spec.ts`:

```ts
import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const APPLICATION_ORIGIN = "http://127.0.0.1:3000";

async function authenticateContext(
  context: BrowserContext,
  user: { id: string; email: string; name: string },
) {
  await context.addCookies([
    { name: "meld-e2e-user-id", value: user.id, url: APPLICATION_ORIGIN },
    {
      name: "meld-e2e-user-email",
      value: user.email,
      url: APPLICATION_ORIGIN,
    },
    { name: "meld-e2e-user-name", value: user.name, url: APPLICATION_ORIGIN },
  ]);
}

async function createWorkspace(
  page: Page,
  input: { name: string; logoFileName: string },
) {
  await page
    .getByRole("textbox", { name: /organization name/i })
    .fill(input.name);
  await page.locator('input[type="file"]').setInputFiles({
    name: input.logoFileName,
    mimeType: "image/png",
    buffer: Buffer.from(`${input.name} logo`),
  });
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(
    page.getByRole("heading", { name: "Invite your team.", exact: true }),
  ).toBeVisible();
  const organizationId = new URL(page.url()).pathname.split("/")[2];

  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Setting up your workspace.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/${organizationId}$`), {
    timeout: 15_000,
  });

  return organizationId;
}

test("switches between workspaces from the rail", async ({ browser }) => {
  const context = await browser.newContext();
  await authenticateContext(context, {
    id: "70000000-0000-4000-8000-000000000007",
    email: "switcher@example.com",
    name: "Switcher Example",
  });
  const page = await context.newPage();

  await page.goto("/onboarding");
  const firstOrganizationId = await createWorkspace(page, {
    name: "Northstar",
    logoFileName: "northstar.png",
  });

  const workspaceRail = page.getByTestId("workspace-rail");
  await expect(
    workspaceRail.getByRole("link", { name: "Northstar" }),
  ).toHaveAttribute("aria-current", "page");

  await workspaceRail.getByRole("link", { name: "Create workspace" }).click();
  const secondOrganizationId = await createWorkspace(page, {
    name: "Basecamp",
    logoFileName: "basecamp.png",
  });
  expect(secondOrganizationId).not.toBe(firstOrganizationId);

  const workspaceLinks = await workspaceRail
    .getByRole("link", { name: /Northstar|Basecamp/ })
    .all();
  expect(workspaceLinks).toHaveLength(2);
  await expect(workspaceLinks[0]).toHaveAccessibleName("Northstar");
  await expect(workspaceLinks[1]).toHaveAccessibleName("Basecamp");
  await expect(workspaceLinks[1]).toHaveAttribute("aria-current", "page");
  await expect(workspaceLinks[0]).not.toHaveAttribute("aria-current");

  await workspaceLinks[0].hover();
  await expect(page.getByRole("tooltip")).toHaveText("Northstar");

  await workspaceLinks[0].click();
  await expect(page).toHaveURL(new RegExp(`/${firstOrganizationId}$`));
  await expect(
    page
      .getByTestId("dashboard-side-nav")
      .getByText("Northstar", { exact: true }),
  ).toBeVisible();
  await expect(
    workspaceRail.getByRole("link", { name: "Northstar" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    workspaceRail.getByRole("link", { name: "Basecamp" }),
  ).not.toHaveAttribute("aria-current");

  await context.close();
});
```

- [ ] **Step 2: Run it and confirm it fails**

Run: `pnpm exec playwright test e2e/workspace-switcher.spec.ts`

Expected: FAIL before Task 2 lands — before that task, this would fail because the rail never showed more than one workspace. Since Tasks 1 and 2 are already complete at this point in the plan, run this once to confirm it currently passes against the finished feature instead; if it fails, the failure points at a real gap in Task 2's implementation to fix before continuing.

- [ ] **Step 3: Fix forward if needed, then confirm it passes**

Re-run until green:

Run: `pnpm exec playwright test e2e/workspace-switcher.spec.ts`

Expected: PASS.

- [ ] **Step 4: Run the complete verification suite**

Run:

```bash
pnpm --filter @meld/web test
pnpm --filter @meld/web typecheck
pnpm --filter @meld/web lint
pnpm check:astryx
pnpm --filter @meld/web build
pnpm exec playwright test e2e/onboarding.spec.ts e2e/workspace-switcher.spec.ts
```

Expected: all pass.

- [ ] **Step 5: Commit**

```bash
git add e2e/workspace-switcher.spec.ts
git commit -m "test: cover switching workspaces from the rail end-to-end"
```
