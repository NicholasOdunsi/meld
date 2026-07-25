// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

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
}));

vi.mock("@/features/discovery/actions", () => ({
  listDiscoveryRooms: mocks.listDiscoveryRooms,
}));

import HomePage from "./page";

afterEach(() => {
  cleanup();
  mocks.listDiscoveryRooms.mockReset();
});

it("asks what the user is building", async () => {
  mocks.listDiscoveryRooms.mockResolvedValue([]);

  render(
    await HomePage({
      params: Promise.resolve({ organizationId: ORGANIZATION_ID }),
    }),
  );

  expect(
    screen.getByRole("heading", { name: "What are you building?" }),
  ).toBeInTheDocument();
});
