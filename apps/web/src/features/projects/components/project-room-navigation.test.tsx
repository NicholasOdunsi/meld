// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { act } from "react";
import { hydrateRoot } from "react-dom/client";
import { renderToString } from "react-dom/server";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const PROJECT_A = "70000000-0000-4000-8000-000000000007";
const PROJECT_B = "80000000-0000-4000-8000-000000000008";
const ROOM_A = "40000000-0000-4000-8000-000000000004";
const ROOM_B = "50000000-0000-4000-8000-000000000005";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const mocks = vi.hoisted(() => ({
  pathname:
    "/30000000-0000-4000-8000-000000000003/rooms/50000000-0000-4000-8000-000000000005",
  createRoomWithParticipants: vi.fn(),
  listRoomInviteCandidates: vi.fn(),
  moveRoom: vi.fn(),
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push, refresh: mocks.refresh }),
}));

vi.mock("@/features/rooms/actions", () => ({
  createRoomWithParticipants: mocks.createRoomWithParticipants,
  listRoomInviteCandidates: mocks.listRoomInviteCandidates,
  moveRoom: mocks.moveRoom,
}));

import {
  ProjectRoomNavigation,
  projectStorageKey,
  resolveOpenProjectId,
} from "./project-room-navigation";

const projects = [
  {
    id: PROJECT_A,
    workspaceId: WORKSPACE_ID,
    name: "Activation",
    createdBy: OWNER_ID,
    icon: "folder" as const,
    color: "blue" as const,
  },
  {
    id: PROJECT_B,
    workspaceId: WORKSPACE_ID,
    name: "Retention",
    createdBy: OWNER_ID,
    icon: "folder" as const,
    color: "blue" as const,
  },
];
const rooms = [
  {
    id: ROOM_A,
    projectId: PROJECT_A,
    name: "Interviews",
    ownerId: OWNER_ID,
    stage: "discovery" as const,
    updatedAt: "2026-08-11T10:00:00.000Z",
  },
  {
    id: ROOM_B,
    projectId: PROJECT_B,
    name: "Cohort review",
    ownerId: OWNER_ID,
    stage: "design" as const,
    updatedAt: "2026-08-11T10:00:00.000Z",
  },
];

beforeEach(() => {
  localStorage.clear();
  vi.clearAllMocks();
  mocks.pathname = `/${WORKSPACE_ID}/rooms/${ROOM_B}`;
  mocks.createRoomWithParticipants.mockReset();
  mocks.listRoomInviteCandidates.mockReset();
  mocks.listRoomInviteCandidates.mockResolvedValue([]);
  mocks.moveRoom.mockResolvedValue({ status: "ok", projectId: PROJECT_A });
});
afterEach(cleanup);

it("prefers the route project and falls back from a deleted stored project", () => {
  expect(
    resolveOpenProjectId({
      routeProjectId: PROJECT_B,
      storedProjectId: PROJECT_A,
      projectIds: [PROJECT_A, PROJECT_B],
    }),
  ).toBe(PROJECT_B);

  expect(
    resolveOpenProjectId({
      routeProjectId: null,
      storedProjectId: "deleted-project",
      projectIds: [PROJECT_A, PROJECT_B],
    }),
  ).toBe(PROJECT_A);
});

it("keeps exactly one project open and synchronizes the active room project", async () => {
  const user = userEvent.setup();
  localStorage.setItem(projectStorageKey(WORKSPACE_ID), PROJECT_A);

  render(
    <ProjectRoomNavigation
      workspaceId={WORKSPACE_ID}
      projects={projects}
      rooms={rooms}
      currentUserId={OWNER_ID}
      isWorkspaceAdmin
    />,
  );

  // The stage glyph is a labelled image inside the row, so the row announces
  // its stage alongside the room name rather than depending on colour alone.
  // Asserting the computed name (rather than the `aria-label` attribute) is
  // what stops the glyph regressing to an `aria-hidden` decorative icon.
  const cohortRoom = screen.getByRole("link", { name: /Cohort review/ });
  expect(cohortRoom).toBeVisible();
  expect(cohortRoom).toHaveAttribute("aria-current", "page");
  expect(
    within(cohortRoom).getByRole("img", { name: "Design" }),
  ).toBeInTheDocument();
  expect(screen.queryByRole("link", { name: /Retention/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Retention" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  await user.click(screen.getByRole("button", { name: "Activation" }));

  expect(screen.getByRole("button", { name: "Activation" })).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  expect(screen.getByRole("button", { name: "Retention" })).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(localStorage.getItem(projectStorageKey(WORKSPACE_ID))).toBe(PROJECT_A);
});

it("collapses the open project on a second click, and reopens it on a third", async () => {
  const user = userEvent.setup();
  localStorage.setItem(projectStorageKey(WORKSPACE_ID), PROJECT_B);

  render(
    <ProjectRoomNavigation
      workspaceId={WORKSPACE_ID}
      projects={projects}
      rooms={rooms}
      currentUserId={OWNER_ID}
      isWorkspaceAdmin
    />,
  );

  const retentionTrigger = screen.getByRole("button", { name: "Retention" });
  expect(retentionTrigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: /Cohort review/ })).toBeVisible();

  await user.click(retentionTrigger);

  expect(retentionTrigger).toHaveAttribute("aria-expanded", "false");
  expect(screen.queryByRole("link", { name: /Cohort review/ })).toBeNull();
  // Collapsing is session-only UI state -- it must not evict the
  // remembered Project a later visit would otherwise reopen.
  expect(localStorage.getItem(projectStorageKey(WORKSPACE_ID))).toBe(PROJECT_B);

  await user.click(retentionTrigger);

  expect(retentionTrigger).toHaveAttribute("aria-expanded", "true");
  expect(screen.getByRole("link", { name: /Cohort review/ })).toBeVisible();
});

// `render()` is a client-only mount, where the stored project is read on the
// very first render. The page a reader actually loads is server-rendered and
// hydrated, and there the stored value is unreadable until after hydration --
// which is the only place the remembered project can be lost. So this one goes
// through the server render and hydrates it.
it("keeps the stored project when a server render is hydrated", async () => {
  mocks.pathname = `/${WORKSPACE_ID}`;
  localStorage.setItem(projectStorageKey(WORKSPACE_ID), PROJECT_B);

  const navigation = (
    <ProjectRoomNavigation
      workspaceId={WORKSPACE_ID}
      projects={projects}
      rooms={rooms}
      currentUserId={OWNER_ID}
      isWorkspaceAdmin
    />
  );
  const container = document.createElement("div");
  container.innerHTML = renderToString(navigation);
  document.body.appendChild(container);

  // The server render cannot know the stored project, so it opens the first.
  expect(
    within(container).getByRole("button", { name: "Activation" }),
  ).toHaveAttribute("aria-expanded", "true");

  const root = await act(async () => hydrateRoot(container, navigation));
  try {
    expect(
      within(container).getByRole("button", { name: "Retention" }),
    ).toHaveAttribute("aria-expanded", "true");
    expect(
      within(container).getByRole("button", { name: "Activation" }),
    ).toHaveAttribute("aria-expanded", "false");
    expect(localStorage.getItem(projectStorageKey(WORKSPACE_ID))).toBe(
      PROJECT_B,
    );
  } finally {
    await act(async () => root.unmount());
    container.remove();
  }
});

it("shows project management only to admins and binds Add Room to the open project", async () => {
  const user = userEvent.setup();
  render(
    <ProjectRoomNavigation
      workspaceId={WORKSPACE_ID}
      projects={projects}
      rooms={rooms}
      currentUserId={OWNER_ID}
      isWorkspaceAdmin
    />,
  );

  expect(screen.getByRole("button", { name: "Create project" })).toBeVisible();

  // The row's quick actions are revealed on hover, like a project row's
  // Notion-style affordance, rather than pinned in the expanded content.
  await user.hover(screen.getByTestId(`project-${PROJECT_B}`));
  expect(
    screen.getByRole("button", { name: "Add room to Retention" }),
  ).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Retention options" }));
  expect(screen.getByRole("menuitem", { name: "Rename" })).toBeVisible();
  expect(screen.getByRole("menuitem", { name: "Delete" })).toBeVisible();
  await user.keyboard("{Escape}");

  await user.click(
    screen.getByRole("button", { name: "Add room to Retention" }),
  );
  expect(screen.getByRole("heading", { name: "Create Room" })).toBeVisible();
  expect(screen.queryByRole("combobox", { name: /project/i })).toBeNull();
  mocks.createRoomWithParticipants.mockResolvedValue({
    roomId: "90000000-0000-4000-8000-000000000009",
    destination: `/${WORKSPACE_ID}/rooms/90000000-0000-4000-8000-000000000009`,
    failedUserIds: [],
  });
  await user.type(
    screen.getByRole("textbox", { name: "Name" }),
    "Win-back research",
  );
  await user.click(screen.getByRole("button", { name: "Create room" }));
  expect(mocks.createRoomWithParticipants).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_B,
    name: "Win-back research",
    participants: [],
  });

  cleanup();
  render(
    <ProjectRoomNavigation
      workspaceId={WORKSPACE_ID}
      projects={projects}
      rooms={rooms}
      currentUserId={OWNER_ID}
      isWorkspaceAdmin={false}
    />,
  );

  expect(screen.queryByRole("button", { name: "Create project" })).toBeNull();
  await user.hover(screen.getByTestId(`project-${PROJECT_B}`));
  expect(
    screen.queryByRole("button", { name: "Retention options" }),
  ).toBeNull();
  expect(
    screen.getByRole("button", { name: "Add room to Retention" }),
  ).toBeVisible();
});

it("delegates scrolling and provides accessible tooltips for icon actions", async () => {
  const user = userEvent.setup();
  render(
    <ProjectRoomNavigation
      workspaceId={WORKSPACE_ID}
      projects={projects}
      rooms={rooms}
      currentUserId={OWNER_ID}
      isWorkspaceAdmin
    />,
  );

  expect(screen.getByTestId("project-room-navigation")).not.toHaveStyle({
    overflowY: "auto",
  });
  const createButton = screen.getByRole("button", { name: "Create project" });
  await user.hover(createButton);
  expect(await screen.findByRole("tooltip")).toHaveTextContent(
    "Create project",
  );

  const openProject = screen.getByTestId(`project-${PROJECT_B}`);
  await user.hover(openProject);
  expect(
    within(openProject).getByRole("button", { name: "Add room to Retention" }),
  ).toBeVisible();
});

it("offers authorized Room moves without changing the canonical Room URL", async () => {
  const user = userEvent.setup();
  render(
    <ProjectRoomNavigation
      workspaceId={WORKSPACE_ID}
      projects={projects}
      rooms={rooms}
      currentUserId={OWNER_ID}
      isWorkspaceAdmin
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Cohort review options" }),
  );
  await user.click(screen.getByRole("menuitem", { name: "Move room" }));
  expect(
    screen.getByRole("heading", { name: "Move Cohort review" }),
  ).toBeVisible();
  await user.click(screen.getByRole("combobox", { name: "Project" }));
  await user.click(screen.getByRole("option", { name: "Activation" }));
  await user.click(screen.getByRole("button", { name: "Move room" }));

  expect(mocks.moveRoom).toHaveBeenCalledWith({
    workspaceId: WORKSPACE_ID,
    roomId: ROOM_B,
    projectId: PROJECT_A,
  });
  expect(localStorage.getItem(projectStorageKey(WORKSPACE_ID))).toBe(PROJECT_A);
  expect(mocks.refresh).toHaveBeenCalledOnce();
  expect(mocks.push).not.toHaveBeenCalled();
});

it("hides Room moves from participants without owner or admin authority", async () => {
  const user = userEvent.setup();
  render(
    <ProjectRoomNavigation
      workspaceId={WORKSPACE_ID}
      projects={projects}
      rooms={rooms}
      currentUserId="20000000-0000-4000-8000-000000000002"
      isWorkspaceAdmin={false}
    />,
  );

  expect(
    screen.queryByRole("button", { name: "Cohort review options" }),
  ).toBeNull();
  await user.click(screen.getByRole("button", { name: "Activation" }));
  expect(
    screen.queryByRole("button", { name: "Interviews options" }),
  ).toBeNull();
});

it("lets participating Workspace admins move Rooms they do not own", async () => {
  const user = userEvent.setup();
  render(
    <ProjectRoomNavigation
      workspaceId={WORKSPACE_ID}
      projects={projects}
      rooms={rooms}
      currentUserId="20000000-0000-4000-8000-000000000002"
      isWorkspaceAdmin
    />,
  );

  await user.click(
    screen.getByRole("button", { name: "Cohort review options" }),
  );
  expect(screen.getByRole("menuitem", { name: "Move room" })).toBeVisible();
  expect(screen.queryByRole("menuitem", { name: "Delete room" })).toBeNull();
});
