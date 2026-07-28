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
  usePathname: () =>
    `/${ORGANIZATION_ID}/discovery/${ROOM_ID}`,
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
  expect(discoveryRoomLink).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(discoveryRoomLink).toHaveAttribute("data-size", "sm");
  expect(
    discoveryRoomLink.closest(
      '[data-astryx-theme="meld-room-navigation"]',
    ),
  ).not.toBeNull();
  expect(screen.getByTestId("discovery-room-icon")).toBeVisible();

  expect(
    screen.getByRole("link", { name: "Discovery Rooms" }),
  ).toBeVisible();
  expect(screen.getByText("Feature Rooms")).toBeVisible();
  expect(screen.getByTestId("discovery-rooms-icon")).toBeVisible();
  expect(screen.getByTestId("feature-rooms-icon")).toBeVisible();
  expect(
    screen.getByTestId("create-discovery-room-icon"),
  ).toHaveAttribute("data-size", "xsm");
  expect(
    screen.getByTestId("create-feature-room-icon"),
  ).toHaveAttribute("data-size", "xsm");
  expect(screen.getAllByRole("navigation")).toHaveLength(2);
  const resizeHandle = screen.getByTestId(
    "astryx-sidenav-resize-handle",
  );
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
  expect(screen.getByTestId("workspace-links")).toHaveAttribute(
    "data-gap",
    "2",
  );
  expect(screen.getByTestId("workspace-rail-items")).toHaveAttribute(
    "data-gap",
    "3",
  );
  const workspaceLinks = within(workspaceRail).getAllByRole("link", {
    name: /Northstar|Basecamp/,
  });
  expect(
    workspaceLinks.map((link) => link.getAttribute("aria-label")),
  ).toEqual(["Northstar", "Basecamp"]);
  expect(workspaceLinks[0]).toHaveAttribute("href", `/${ORGANIZATION_ID}`);
  expect(workspaceLinks[0]).toHaveAttribute("aria-current", "page");
  expect(workspaceLinks[1]).toHaveAttribute(
    "href",
    `/${SECOND_ORGANIZATION_ID}`,
  );
  expect(workspaceLinks[1]).not.toHaveAttribute("aria-current");
  expect(
    within(workspaceRail)
      .getAllByRole("link")
      .map((link) => link.getAttribute("aria-label")),
  ).toEqual(["Northstar", "Basecamp", "Create workspace"]);
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

  expect(
    screen.getByRole("link", { name: "Home" }),
  ).toHaveAttribute("href", `/${ORGANIZATION_ID}`);
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
      rooms={[
        { id: ROOM_ID, name: "Customer interviews", ownerId: OWNER_ID },
      ]}
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
      rooms={[
        { id: ROOM_ID, name: "Customer interviews", ownerId: OWNER_ID },
      ]}
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

  expect(
    screen.getByRole("heading", { name: "Delete room" }),
  ).toBeVisible();
  expect(
    screen.getByText(
      "This permanently deletes everything in the room. This can't be undone.",
    ),
  ).toBeVisible();
  expect(
    screen.getByRole("button", { name: "Delete room" }),
  ).toBeVisible();
});
