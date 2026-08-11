// @vitest-environment jsdom

import { cleanup, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, expect, it, vi } from "vitest";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const SECOND_WORKSPACE_ID = "60000000-0000-4000-8000-000000000006";
const PROJECT_ID = "70000000-0000-4000-8000-000000000007";
const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => `/${WORKSPACE_ID}/rooms/${ROOM_ID}`,
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

import { WorkspaceNavigation } from "./workspace-navigation";

const PROJECTS = [
  {
    id: PROJECT_ID,
    workspaceId: WORKSPACE_ID,
    name: "Activation",
    createdBy: OWNER_ID,
  },
];
const ROOMS = [
  {
    id: ROOM_ID,
    projectId: PROJECT_ID,
    name: "Customer interviews",
    ownerId: OWNER_ID,
    stage: "discovery" as const,
    updatedAt: "2026-08-11T10:00:00.000Z",
  },
];
const SINGLE_WORKSPACE = [
  { id: WORKSPACE_ID, name: "Northstar", logoUrl: null, hasAttention: false },
];
const TWO_WORKSPACES = [
  ...SINGLE_WORKSPACE,
  {
    id: SECOND_WORKSPACE_ID,
    name: "Basecamp",
    logoUrl: null,
    hasAttention: false,
  },
];

function renderNavigation(
  overrides: Partial<Parameters<typeof WorkspaceNavigation>[0]> = {},
) {
  return render(
    <WorkspaceNavigation
      workspaceId={WORKSPACE_ID}
      workspaceName="Northstar"
      workspaces={SINGLE_WORKSPACE}
      currentUserId={OWNER_ID}
      isWorkspaceAdmin
      projects={PROJECTS}
      rooms={ROOMS}
      {...overrides}
    />,
  );
}

afterEach(() => {
  cleanup();
  localStorage.clear();
  vi.clearAllMocks();
});

it("renders workspace, primary, project, and room navigation", () => {
  renderNavigation({
    workspaces: [
      {
        id: WORKSPACE_ID,
        name: "Northstar",
        logoUrl: "https://example.com/northstar.png",
        hasAttention: false,
      },
    ],
  });

  expect(screen.getByTestId("workspace-navigation")).toHaveStyle({
    backgroundColor: "var(--color-background-surface)",
  });
  expect(screen.getByTestId("workspace-logo")).toHaveAttribute(
    "src",
    "https://example.com/northstar.png",
  );
  expect(screen.getByRole("link", { name: "Home" })).toHaveAttribute(
    "href",
    `/${WORKSPACE_ID}`,
  );
  expect(screen.getByRole("link", { name: "AI connections" })).toHaveAttribute(
    "href",
    `/${WORKSPACE_ID}/settings/devices`,
  );
  expect(screen.getByRole("button", { name: "Activation" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.queryByRole("link", { name: "Activation" })).toBeNull();
  expect(screen.getByRole("link", { name: "Customer interviews" })).toHaveAttribute(
    "href",
    `/${WORKSPACE_ID}/rooms/${ROOM_ID}`,
  );
  expect(screen.getByRole("link", { name: "Customer interviews" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.getAllByRole("navigation")).toHaveLength(2);
});

it("orders workspace links and pins Create workspace in the rail footer", () => {
  renderNavigation({ workspaces: TWO_WORKSPACES });

  const workspaceRail = screen.getByTestId("workspace-rail");
  const workspaceLinks = within(screen.getByTestId("workspace-links")).getAllByRole(
    "link",
  );
  expect(workspaceLinks.map((link) => link.getAttribute("aria-label"))).toEqual([
    "Northstar",
    "Basecamp",
  ]);
  expect(workspaceLinks[0]).toHaveAttribute("aria-current", "page");
  expect(workspaceLinks[1]).not.toHaveAttribute("aria-current");
  expect(
    within(screen.getByTestId("workspace-rail-footer")).getByRole("link", {
      name: "Create workspace",
    }),
  ).toHaveAttribute("href", "/onboarding");
  expect(
    within(workspaceRail).getAllByRole("link").map((link) => link.getAttribute("aria-label")),
  ).toEqual(["Northstar", "Basecamp", "Create workspace"]);
});

it("marks the workspaces that need attention without naming what waits there", () => {
  renderNavigation({
    workspaces: [
      { ...SINGLE_WORKSPACE[0], hasAttention: true },
      { ...TWO_WORKSPACES[1], hasAttention: false },
    ],
  });

  const workspaceRail = screen.getByTestId("workspace-rail");
  const workspaceLinks = within(screen.getByTestId("workspace-links")).getAllByRole(
    "link",
  );
  // The attention has to live in the item's own accessible name. The
  // collapsed rail item labels its anchor, and an element with an aria-label
  // is named by that label alone -- a label nested on the dot inside it would
  // never be announced.
  expect(
    workspaceLinks.map((link) => link.getAttribute("aria-label")),
  ).toEqual(["Northstar needs attention", "Basecamp"]);
  expect(
    within(workspaceLinks[0]).getByTestId("workspace-attention"),
  ).toHaveAttribute("aria-hidden", "true");
  expect(
    within(workspaceLinks[1]).queryByTestId("workspace-attention"),
  ).toBeNull();

  // Everything the rail can say, said: one signal, naming only the workspace
  // that is waiting. The Room and Project it was handed stay in the other
  // nav, so no Room name or message body can reach the rail.
  expect(
    within(workspaceRail)
      .getAllByRole("link")
      .map((link) => link.getAttribute("aria-label")),
  ).toEqual(["Northstar needs attention", "Basecamp", "Create workspace"]);
  expect(workspaceRail).not.toHaveTextContent("Customer interviews");
  expect(workspaceRail).not.toHaveTextContent("Activation");

  cleanup();
  renderNavigation({ workspaces: TWO_WORKSPACES });
  expect(
    within(screen.getByTestId("workspace-links"))
      .getAllByRole("link")
      .map((link) => link.getAttribute("aria-label")),
  ).toEqual(["Northstar", "Basecamp"]);
  expect(screen.queryByTestId("workspace-attention")).toBeNull();
});

it("shows workspace and icon-action tooltips", async () => {
  const user = userEvent.setup();
  renderNavigation({ workspaces: TWO_WORKSPACES });

  await user.hover(screen.getByRole("link", { name: "Basecamp" }));
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Basecamp");
  await user.unhover(screen.getByRole("link", { name: "Basecamp" }));
  await waitFor(() => {
    expect(screen.queryByRole("tooltip")).toBeNull();
  });
  await user.hover(screen.getByRole("button", { name: "Create project" }));
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Create project");
});

it("keeps project administration hidden from non-admin members", () => {
  renderNavigation({ isWorkspaceAdmin: false });

  expect(screen.queryByRole("button", { name: "Create project" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Rename Activation" })).toBeNull();
  expect(screen.queryByRole("button", { name: "Delete Activation" })).toBeNull();
  expect(screen.getByRole("button", { name: "Add room to Activation" })).toBeVisible();
});

it("keeps Primary and Projects in one SideNav-owned scroll zone", () => {
  renderNavigation();

  const sideNav = screen.getByTestId("workspace-side-nav");
  const projectNavigation = screen.getByTestId("project-room-navigation");
  const scrollZone = projectNavigation.parentElement;
  expect(scrollZone?.parentElement).toBe(sideNav);
  expect(within(scrollZone as HTMLElement).getByText("Home")).toBeVisible();
  expect(projectNavigation).not.toHaveStyle({ overflowY: "auto" });
  const resizeHandle = screen.getByTestId("astryx-sidenav-resize-handle");
  expect(resizeHandle).toHaveAttribute("aria-valuemin", "220");
  expect(resizeHandle).toHaveAttribute("aria-valuenow", "256");
  expect(resizeHandle).toHaveAttribute("aria-valuemax", "320");
});
