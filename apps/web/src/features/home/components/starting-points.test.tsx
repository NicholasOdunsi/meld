// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
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

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/discovery/actions", () => ({
  createDiscoveryRoomFromForm: vi.fn(),
}));

import { StartingPoints } from "./starting-points";

afterEach(cleanup);

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

it("offers exactly two starting points", () => {
  render(<StartingPoints organizationId={ORGANIZATION_ID} />);

  expect(
    screen.getByRole("button", { name: "Start a Discovery Room" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Upload what you have" }),
  ).toBeInTheDocument();
});

// Deleting the compact HStack (starting-points.tsx:29-43) leaves the cards
// branch untouched, so every other test in this file keeps passing -- this
// is the only test that would catch that regression, since the compact
// variant is how the weighting is meant to work on the smaller layout.
it("offers the same two starting points in the compact variant", () => {
  render(
    <StartingPoints organizationId={ORGANIZATION_ID} isCompact />,
  );

  expect(
    screen.getByRole("button", { name: "New room" }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole("button", { name: "Upload" }),
  ).toBeInTheDocument();
});

it("opens the create-room dialog from the compact New room action", async () => {
  const user = userEvent.setup();
  render(
    <StartingPoints organizationId={ORGANIZATION_ID} isCompact />,
  );

  await user.click(screen.getByRole("button", { name: "New room" }));

  expect(
    within(screen.getByRole("dialog")).getByText(
      "Start a Discovery Room",
    ),
  ).toBeInTheDocument();
});

it("opens the upload dialog from the compact Upload action", async () => {
  const user = userEvent.setup();
  render(
    <StartingPoints organizationId={ORGANIZATION_ID} isCompact />,
  );

  await user.click(screen.getByRole("button", { name: "Upload" }));

  expect(
    within(screen.getByRole("dialog")).getByText(
      "Upload what you have",
    ),
  ).toBeInTheDocument();
});
