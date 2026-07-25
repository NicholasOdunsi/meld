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
const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const mocks = vi.hoisted(() => ({
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  usePathname: () =>
    `/${ORGANIZATION_ID}/discovery/${ROOM_ID}`,
  useRouter: () => ({
    push: mocks.push,
  }),
}));

import { DashboardNavigation } from "./dashboard-navigation";

afterEach(() => {
  cleanup();
  mocks.push.mockClear();
});

it("renders workspace, primary, discovery, and feature navigation", () => {
  render(
    <DashboardNavigation
      organizationId={ORGANIZATION_ID}
      organizationName="Northstar"
      organizationLogoUrl="https://example.com/northstar.png"
      rooms={[
        {
          id: ROOM_ID,
          name: "Customer interviews",
        },
      ]}
    />,
  );

  expect(screen.getAllByText("Northstar").length).toBeGreaterThan(0);
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

  expect(
    screen.getByRole("link", { name: "Create workspace" }),
  ).toHaveAttribute("href", "/onboarding");
  expect(
    screen.getByRole("link", { name: "Customer interviews" }),
  ).toHaveAttribute(
    "href",
    `/${ORGANIZATION_ID}/discovery/${ROOM_ID}`,
  );
  expect(
    screen.getByRole("link", { name: "Customer interviews" }),
  ).toHaveAttribute("aria-current", "page");

  expect(screen.getByText("Discovery Rooms")).toBeVisible();
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
});
