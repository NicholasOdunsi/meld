// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import type { Room } from "@/features/rooms/repository";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const PROJECT_ID = "70000000-0000-4000-8000-000000000007";
const OTHER_PROJECT_ID = "70000000-0000-4000-8000-000000000008";
const USER_ID = "10000000-0000-4000-8000-000000000001";
// Hoisted rather than written inline: `check:astryx` reads `color: "blue"`
// inside an object literal as a hardcoded CSS colour.
const TILE_COLOR = "blue" as const;
const OTHER_TILE_COLOR = "pink" as const;

const mocks = vi.hoisted(() => ({
  listRooms: vi.fn(),
  listWorkspaceProjects: vi.fn(),
  listPendingItems: vi.fn(),
  isAnyAgentWorking: vi.fn(),
  requireWorkspaceAccess: vi.fn(),
  createClient: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/workspaces/require-workspace-access", () => ({
  requireWorkspaceAccess: mocks.requireWorkspaceAccess,
}));

vi.mock("@/lib/supabase/server", () => ({
  createClient: mocks.createClient,
}));

vi.mock("@/features/rooms/queries", () => ({
  listRooms: mocks.listRooms,
  createRoomFromForm: vi.fn(),
  listRoomInviteCandidates: vi.fn().mockResolvedValue([]),
  createRoomWithParticipants: vi.fn(),
}));

vi.mock("@/features/home/actions", () => ({
  listPendingItems: mocks.listPendingItems,
  listAttentionItems: vi.fn(),
  acknowledgeMention: vi.fn(),
}));

vi.mock("@/features/home/agent-presence", () => ({
  isAnyAgentWorking: mocks.isAnyAgentWorking,
}));

vi.mock("@/features/projects/actions", () => ({
  listWorkspaceProjects: mocks.listWorkspaceProjects,
  createProject: vi.fn(),
}));

import WorkspaceDeckPage from "./page";

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: "40000000-0000-4000-8000-000000000004",
    workspaceId: WORKSPACE_ID,
    projectId: PROJECT_ID,
    name: "Checkout",
    ownerId: USER_ID,
    stage: "discovery",
    updatedAt: "2026-07-20T10:00:00.000Z",
    createdAt: "2026-07-01T00:00:00.000Z",
    lastActivityAt: "2026-07-20T10:00:00.000Z",
    ...overrides,
  } as Room;
}

function renderPage() {
  return WorkspaceDeckPage({
    params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
  });
}

beforeEach(() => {
  mocks.requireWorkspaceAccess.mockResolvedValue({
    currentUserId: USER_ID,
    isAdmin: true,
    workspaceName: "Northstar",
  });
  mocks.listWorkspaceProjects.mockResolvedValue([
    {
      id: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      name: "Mobile onboarding",
      createdBy: USER_ID,
      icon: "folder",
      color: TILE_COLOR,
    },
  ]);
  mocks.listRooms.mockResolvedValue([]);
  mocks.listPendingItems.mockResolvedValue([]);
  mocks.isAnyAgentWorking.mockResolvedValue(false);
  mocks.createClient.mockResolvedValue({});
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

it("renders the deck for the workspace", async () => {
  render(await renderPage());

  expect(screen.getByTestId("deck-frame")).toBeInTheDocument();
  expect(screen.getByTestId("deck-ticket")).toBeInTheDocument();
  expect(screen.getAllByText("Northstar").length).toBeGreaterThan(0);
  expect(screen.getByText("Mobile onboarding")).toBeInTheDocument();
});

it("checks access before it fetches anything", async () => {
  // Proving the ordering, not just the call: a guard that runs *after* the
  // queries still satisfies "was called", and this page is the only thing
  // standing between a non-member and a workspace's project and room names.
  // If the guard stops the request, nothing may have been read by then.
  mocks.requireWorkspaceAccess.mockRejectedValue(
    new Error("redirect:/sign-in"),
  );

  await expect(renderPage()).rejects.toThrow("redirect:/sign-in");

  expect(mocks.requireWorkspaceAccess).toHaveBeenCalledWith(WORKSPACE_ID);
  expect(mocks.listWorkspaceProjects).not.toHaveBeenCalled();
  expect(mocks.listRooms).not.toHaveBeenCalled();
  expect(mocks.listPendingItems).not.toHaveBeenCalled();
  expect(mocks.isAnyAgentWorking).not.toHaveBeenCalled();
});

it("skips the pending and presence queries when the workspace has no rooms", async () => {
  render(await renderPage());

  // Every pending kind and every agent task is anchored to a room, so with
  // zero rooms both results are provably empty.
  expect(mocks.listPendingItems).not.toHaveBeenCalled();
  expect(mocks.isAnyAgentWorking).not.toHaveBeenCalled();
  expect(screen.getByText("NOTHING PENDING")).toBeInTheDocument();
});

it("hands the already-fetched rooms to the pending query once rooms exist", async () => {
  const rooms = [room()];
  mocks.listRooms.mockResolvedValue(rooms);

  render(await renderPage());

  expect(mocks.listPendingItems).toHaveBeenCalledWith(WORKSPACE_ID, rooms);
  expect(mocks.isAnyAgentWorking).toHaveBeenCalled();
});

it("counts a project's rooms and links its tile to the most recent one", async () => {
  mocks.listRooms.mockResolvedValue([
    room({ id: "room-old", lastActivityAt: "2026-07-01T10:00:00.000Z" }),
    room({ id: "room-new", lastActivityAt: "2026-08-19T10:00:00.000Z" }),
  ]);

  render(await renderPage());

  expect(
    screen.getByRole("link", { name: /Mobile onboarding/ }),
  ).toHaveAttribute("href", `/${WORKSPACE_ID}/rooms/room-new`);
  // The tile prints "N rooms · age" as one string.
  expect(screen.getByText(/^2 rooms · /)).toBeInTheDocument();
});

it("picks the most recently active room by timestamp, not array position", async () => {
  // The room with the later `lastActivityAt` is listed *first* here -- the
  // opposite order from the test above. A selection that just kept
  // whichever room it saw last (an array-order bug rather than a timestamp
  // comparison) would pass the test above by coincidence, since there
  // insertion order and recency order are the same. This pins the actual
  // rule: latest `lastActivityAt` wins regardless of where it sits in the
  // `rooms` array, which is exactly what `fakeMoveRoom` can produce -- it
  // reorders a room into a new project without touching `lastActivityAt`.
  mocks.listRooms.mockResolvedValue([
    room({ id: "room-new", lastActivityAt: "2026-08-19T10:00:00.000Z" }),
    room({ id: "room-old", lastActivityAt: "2026-07-01T10:00:00.000Z" }),
  ]);

  render(await renderPage());

  expect(
    screen.getByRole("link", { name: /Mobile onboarding/ }),
  ).toHaveAttribute("href", `/${WORKSPACE_ID}/rooms/room-new`);
});

it("does not link a project that has no rooms", async () => {
  mocks.listWorkspaceProjects.mockResolvedValue([
    {
      id: OTHER_PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      // Not "Growth": that is also the label of the rocket icon inside the
      // (always-mounted) create-project dialog, and the name would match twice.
      name: "Retention rework",
      createdBy: USER_ID,
      icon: "folder",
      color: OTHER_TILE_COLOR,
    },
  ]);
  mocks.listRooms.mockResolvedValue([room()]);

  render(await renderPage());

  expect(screen.queryByRole("link", { name: /Retention rework/ })).toBeNull();
  expect(screen.getByText("Retention rework")).toBeInTheDocument();
  // No age clause: nothing has ever happened in this project, so the tile
  // prints the count alone rather than "0 rooms · now".
  expect(screen.getByText("0 rooms")).toBeInTheDocument();
  expect(screen.queryByText(/0 rooms · /)).not.toBeInTheDocument();
});

it("only reports the design agent as working when a run is in flight", async () => {
  mocks.listRooms.mockResolvedValue([room()]);
  mocks.isAnyAgentWorking.mockResolvedValue(true);

  render(await renderPage());

  expect(screen.getByText("DESIGN · DRAWING")).toBeInTheDocument();
});
