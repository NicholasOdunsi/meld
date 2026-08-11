// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const PROJECT_ID = "70000000-0000-4000-8000-000000000007";

const mocks = vi.hoisted(() => ({
  listRooms: vi.fn(),
  listWorkspaceProjects: vi.fn(),
  listAttentionItems: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/rooms/queries", () => ({
  listRooms: mocks.listRooms,
  createRoomFromForm: vi.fn(),
  listRoomInviteCandidates: vi.fn().mockResolvedValue([]),
  createRoomWithParticipants: vi.fn(),
}));

vi.mock("@/features/home/actions", () => ({
  listAttentionItems: mocks.listAttentionItems,
}));

vi.mock("@/features/projects/actions", () => ({
  listWorkspaceProjects: mocks.listWorkspaceProjects,
}));

import HomePage from "./page";

beforeEach(() => {
  mocks.listWorkspaceProjects.mockResolvedValue([
    {
      id: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      name: "Mobile onboarding",
      createdBy: "10000000-0000-4000-8000-000000000001",
    },
  ]);
});

afterEach(() => {
  cleanup();
  mocks.listRooms.mockReset();
  mocks.listAttentionItems.mockReset();
  mocks.listWorkspaceProjects.mockReset();
});

it("asks what the user is building", async () => {
  mocks.listRooms.mockResolvedValue([]);
  mocks.listAttentionItems.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    }),
  );

  expect(
    screen.getByRole("heading", { name: "What are you building?" }),
  ).toBeInTheDocument();
});

it("shows the starting cards and the needs-attention empty state when there are no rooms", async () => {
  mocks.listRooms.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    }),
  );

  expect(
    screen.getByRole("button", { name: "Start a Room" }),
  ).toBeInTheDocument();
  expect(screen.getByText("Needs attention")).toBeInTheDocument();
  expect(
    screen.getByText("You're all caught up"),
  ).toBeInTheDocument();
  expect(screen.queryByText("Your rooms")).not.toBeInTheDocument();
  // Every attention kind is anchored to a room; with zero rooms the result
  // is guaranteed empty, so the query is skipped entirely.
  expect(mocks.listAttentionItems).not.toHaveBeenCalled();
});

it("keeps the cards visible and queries attention once rooms exist", async () => {
  mocks.listRooms.mockResolvedValue([
    {
      id: "40000000-0000-4000-8000-000000000004",
      workspaceId: WORKSPACE_ID,
      name: "Checkout",
      ownerId: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-07-01T00:00:00.000Z",
      lastActivityAt: "2026-07-20T10:00:00.000Z",
    },
  ]);
  mocks.listAttentionItems.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    }),
  );

  expect(
    screen.getByRole("button", { name: "Start a Room" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("You're all caught up"),
  ).toBeInTheDocument();
  expect(screen.queryByText("Your rooms")).not.toBeInTheDocument();
  expect(mocks.listAttentionItems).toHaveBeenCalledWith(
    WORKSPACE_ID,
  );
});
