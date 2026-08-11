// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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
}));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/rooms/actions", () => ({
  createRoomWithParticipants: mocks.createRoomWithParticipants,
  listRoomInviteCandidates: mocks.listRoomInviteCandidates,
}));

import {
  ProjectRoomNavigation,
  projectStorageKey,
  resolveOpenProjectId,
} from "./project-room-navigation";

const projects = [
  { id: PROJECT_A, workspaceId: WORKSPACE_ID, name: "Activation", createdBy: OWNER_ID },
  { id: PROJECT_B, workspaceId: WORKSPACE_ID, name: "Retention", createdBy: OWNER_ID },
];
const rooms = [
  { id: ROOM_A, projectId: PROJECT_A, name: "Interviews", ownerId: OWNER_ID, stage: "discovery" as const },
  { id: ROOM_B, projectId: PROJECT_B, name: "Cohort review", ownerId: OWNER_ID, stage: "design" as const },
];

beforeEach(() => {
  localStorage.clear();
  mocks.pathname = `/${WORKSPACE_ID}/rooms/${ROOM_B}`;
  mocks.createRoomWithParticipants.mockReset();
  mocks.listRoomInviteCandidates.mockReset();
  mocks.listRoomInviteCandidates.mockResolvedValue([]);
});
afterEach(cleanup);

it("prefers the route project and falls back from a deleted stored project", () => {
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

  expect(screen.getByRole("link", { name: "Cohort review" })).toBeVisible();
  expect(screen.getByRole("link", { name: "Cohort review" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(screen.queryByRole("link", { name: "Retention" })).toBeNull();
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
  expect(screen.getByRole("button", { name: "Rename Retention" })).toBeVisible();
  expect(screen.getByRole("button", { name: "Delete Retention" })).toBeVisible();
  await user.click(screen.getByRole("button", { name: "Add room to Retention" }));
  expect(screen.getByRole("heading", { name: "Create Room" })).toBeVisible();
  expect(screen.queryByRole("combobox", { name: /project/i })).toBeNull();
  mocks.createRoomWithParticipants.mockResolvedValue({
    roomId: "90000000-0000-4000-8000-000000000009",
    destination: `/${WORKSPACE_ID}/rooms/90000000-0000-4000-8000-000000000009`,
    failedUserIds: [],
  });
  await user.type(screen.getByRole("textbox", { name: "Name" }), "Win-back research");
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
  expect(screen.queryByRole("button", { name: /Rename Retention/ })).toBeNull();
  expect(screen.queryByRole("button", { name: /Delete Retention/ })).toBeNull();
  expect(screen.getByRole("button", { name: "Add room to Retention" })).toBeVisible();
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
  expect(await screen.findByRole("tooltip")).toHaveTextContent("Create project");

  const openProject = screen.getByTestId(`project-${PROJECT_B}`);
  expect(within(openProject).getByRole("button", { name: "Add room to Retention" })).toBeVisible();
});
