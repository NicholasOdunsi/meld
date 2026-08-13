// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";

let prefersReducedMotion = false;

// Overrides the shared always-false matchMedia from vitest.setup.ts: this
// suite toggles prefers-reduced-motion per test via the flag above.
vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches:
      query === "(prefers-reduced-motion: reduce)" &&
      prefersReducedMotion,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

const mocks = vi.hoisted(() => ({
  prefetch: vi.fn(),
  replace: vi.fn(),
}));

// Next returns a stable router object; mirror that so effects do not re-run.
const router = {
  prefetch: mocks.prefetch,
  replace: mocks.replace,
  push: vi.fn(),
  refresh: vi.fn(),
};

vi.mock("next/navigation", () => ({
  useRouter: () => router,
}));

import { WorkspaceSetup } from "./workspace-setup";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";

beforeEach(() => {
  vi.useFakeTimers();
  prefersReducedMotion = false;
  mocks.prefetch.mockClear();
  mocks.replace.mockClear();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

function advance(milliseconds: number) {
  act(() => {
    vi.advanceTimersByTime(milliseconds);
  });
}

it("rotates through the product tips and then enters the workspace", () => {
  render(<WorkspaceSetup workspaceId={WORKSPACE_ID} />);

  expect(
    screen.getByRole("heading", {
      name: "Setting up your workspace.",
    }),
  ).toBeVisible();
  expect(
    screen.getByText(/Invite your team into Rooms/),
  ).toBeVisible();
  expect(mocks.prefetch).toHaveBeenCalledWith(
    `/${WORKSPACE_ID}`,
  );
  expect(mocks.replace).not.toHaveBeenCalled();

  advance(2000);
  expect(
    screen.getByText(/Mention the Product Agent/),
  ).toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();

  advance(2000);
  expect(
    screen.getByText(/Connect your own Codex or Claude subscription/),
  ).toBeInTheDocument();
  expect(mocks.replace).not.toHaveBeenCalled();

  advance(2000);
  expect(mocks.replace).toHaveBeenCalledWith(
    `/${WORKSPACE_ID}`,
  );
});

it("holds the last tip instead of advancing past the list", () => {
  render(<WorkspaceSetup workspaceId={WORKSPACE_ID} />);

  advance(10000);

  expect(
    screen.getByText(/Connect your own Codex or Claude subscription/),
  ).toBeInTheDocument();
});

it("renders the animation-ready Meld bot with playful motion", () => {
  render(<WorkspaceSetup workspaceId={WORKSPACE_ID} />);

  expect(screen.getByTestId("workspace-setup-mascot")).toHaveAttribute(
    "data-motion",
    "playful",
  );
  expect(screen.getByTestId("workspace-setup-mascot-bot")).toHaveAttribute(
    "data-variant",
    "meld",
  );
  expect(screen.getByTestId("meld-bot-left-arm")).toBeVisible();
  expect(screen.getByTestId("meld-bot-right-arm")).toBeVisible();
  expect(screen.getByTestId("meld-bot-left-leg")).toBeVisible();
  expect(screen.getByTestId("meld-bot-right-leg")).toBeVisible();
  expect(
    screen.queryByTestId("workspace-setup-mascot-image"),
  ).not.toBeInTheDocument();
});

it("keeps the mascot static when reduced motion is preferred", () => {
  prefersReducedMotion = true;

  render(<WorkspaceSetup workspaceId={WORKSPACE_ID} />);

  expect(screen.getByTestId("workspace-setup-mascot")).toHaveAttribute(
    "data-motion",
    "reduced",
  );
});
