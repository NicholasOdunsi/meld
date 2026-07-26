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

import { RoomSummaryList } from "./room-summary-list";

const ORGANIZATION_ID = "20000000-0000-4000-8000-000000000001";

afterEach(cleanup);

it("links each room and shows its last activity", () => {
  render(
    <RoomSummaryList
      organizationId={ORGANIZATION_ID}
      rooms={[
        {
          id: "40000000-0000-4000-8000-000000000004",
          organizationId: ORGANIZATION_ID,
          name: "Checkout",
          ownerId: "10000000-0000-4000-8000-000000000001",
          createdAt: "2026-07-01T00:00:00.000Z",
          lastActivityAt: "2026-07-20T10:00:00.000Z",
        },
      ]}
    />,
  );

  expect(
    screen.getByRole("link", { name: /Checkout/ }),
  ).toHaveAttribute(
    "href",
    `/${ORGANIZATION_ID}/discovery/40000000-0000-4000-8000-000000000004`,
  );
});

it("keeps the section header visible and shows an empty state with no rooms", () => {
  render(
    <RoomSummaryList organizationId={ORGANIZATION_ID} rooms={[]} />,
  );

  expect(
    screen.getByRole("heading", { name: "Your rooms" }),
  ).toBeInTheDocument();
  expect(screen.getByText("No rooms yet")).toBeInTheDocument();
});
