// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

vi.stubGlobal(
  "ResizeObserver",
  vi.fn().mockImplementation(() => ({
    observe: vi.fn(),
    unobserve: vi.fn(),
    disconnect: vi.fn(),
  })),
);

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
}));

vi.mock("@/features/home/actions", () => ({
  listAttentionItems: mocks.listAttentionItems,
}));

import HomePage from "./page";

// jsdom does not implement the native dialog methods Astryx's Dialog calls.
beforeEach(() => {
  HTMLDialogElement.prototype.showModal = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.setAttribute("open", "");
  });
  HTMLDialogElement.prototype.close = vi.fn(function (
    this: HTMLDialogElement,
  ) {
    this.removeAttribute("open");
  });
});

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

it("lets the cards carry the screen when there are no rooms", async () => {
  mocks.listDiscoveryRooms.mockResolvedValue([]);
  mocks.listAttentionItems.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    }),
  );

  expect(
    screen.getByRole("button", { name: "Start a Discovery Room" }),
  ).toBeInTheDocument();
  expect(screen.queryByText("Your rooms")).not.toBeInTheDocument();
  expect(
    screen.queryByText("You're all caught up"),
  ).not.toBeInTheDocument();
});

it("leads with needs attention once rooms exist", async () => {
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

  expect(screen.getByText("Your rooms")).toBeInTheDocument();
  expect(
    screen.getByText("You're all caught up"),
  ).toBeInTheDocument();
  expect(
    screen.queryByRole("button", { name: "Start a Discovery Room" }),
  ).not.toBeInTheDocument();
});
