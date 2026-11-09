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

vi.mock("next/headers", () => ({
  headers: () =>
    Promise.resolve({
      get: () => null,
    }),
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

vi.mock("@/features/activity/actions", () => ({
  getWorkspaceActivity: vi.fn().mockResolvedValue([]),
  dismissRoomAttention: vi.fn(),
  dismissProposal: vi.fn(),
}));

import HomePage from "./page";

beforeEach(() => {
  mocks.listWorkspaceProjects.mockResolvedValue([
    {
      id: PROJECT_ID,
      workspaceId: WORKSPACE_ID,
      name: "Mobile onboarding",
      createdBy: "10000000-0000-4000-8000-000000000001",
      icon: "rocket",
      color: "blue",
    },
  ]);
});

afterEach(() => {
  cleanup();
  mocks.listRooms.mockReset();
  mocks.listAttentionItems.mockReset();
  mocks.listWorkspaceProjects.mockReset();
});

it("greets with Overview summary counts", async () => {
  mocks.listRooms.mockResolvedValue([]);
  mocks.listAttentionItems.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    }),
  );

  expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  expect(
    screen.getByText("1 project · 0 working · 0 need you"),
  ).toBeInTheDocument();
});

it("shows Needs you, All projects, and starting cards when projects exist", async () => {
  mocks.listRooms.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    }),
  );

  expect(
    screen.getByRole("heading", { name: "Needs you" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("heading", { name: "All projects" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Start a Room" }),
  ).toBeInTheDocument();
  expect(screen.getByText("You're all caught up")).toBeInTheDocument();
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
      projectId: PROJECT_ID,
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
  expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  expect(screen.queryByText("Your rooms")).not.toBeInTheDocument();
  expect(mocks.listAttentionItems).toHaveBeenCalledWith(WORKSPACE_ID);
});

it("keeps the empty-workspace state when there are no projects", async () => {
  mocks.listWorkspaceProjects.mockResolvedValue([]);
  mocks.listRooms.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ workspaceId: WORKSPACE_ID }),
    }),
  );

  expect(screen.getByTestId("no-projects-empty-state")).toBeInTheDocument();
  expect(screen.queryByText("Needs you")).not.toBeInTheDocument();
  expect(screen.queryByText("All projects")).not.toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Start a Room" }),
  ).not.toBeInTheDocument();
});
