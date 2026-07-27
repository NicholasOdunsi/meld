// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

const ORGANIZATION_ID = "30000000-0000-4000-8000-000000000003";

const mocks = vi.hoisted(() => ({
  listDiscoveryRooms: vi.fn(),
  listAttentionItems: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/discovery/actions", () => ({
  listDiscoveryRooms: mocks.listDiscoveryRooms,
  createDiscoveryRoomFromForm: vi.fn(),
  listRoomInviteCandidates: vi.fn().mockResolvedValue([]),
  createRoomWithParticipants: vi.fn(),
}));

vi.mock("@/features/home/actions", () => ({
  listAttentionItems: mocks.listAttentionItems,
}));

import HomePage from "./page";


afterEach(() => {
  cleanup();
  mocks.listDiscoveryRooms.mockReset();
  mocks.listAttentionItems.mockReset();
});

it("asks what the user is building", async () => {
  mocks.listDiscoveryRooms.mockResolvedValue([]);
  mocks.listAttentionItems.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    }),
  );

  expect(
    screen.getByRole("heading", { name: "What are you building?" }),
  ).toBeInTheDocument();
});

it("shows the starting cards and the needs-attention empty state when there are no rooms", async () => {
  mocks.listDiscoveryRooms.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    }),
  );

  expect(
    screen.getByRole("button", { name: "Start a Discovery Room" }),
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
  mocks.listDiscoveryRooms.mockResolvedValue([
    {
      id: "40000000-0000-4000-8000-000000000004",
      organizationId: ORGANIZATION_ID,
      name: "Checkout",
      ownerId: "10000000-0000-4000-8000-000000000001",
      createdAt: "2026-07-01T00:00:00.000Z",
      lastActivityAt: "2026-07-20T10:00:00.000Z",
    },
  ]);
  mocks.listAttentionItems.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    }),
  );

  expect(
    screen.getByRole("button", { name: "Start a Discovery Room" }),
  ).toBeInTheDocument();
  expect(
    screen.getByText("You're all caught up"),
  ).toBeInTheDocument();
  expect(screen.queryByText("Your rooms")).not.toBeInTheDocument();
  expect(mocks.listAttentionItems).toHaveBeenCalledWith(
    ORGANIZATION_ID,
  );
});
