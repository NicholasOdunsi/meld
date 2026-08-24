// @vitest-environment jsdom

import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { DesktopOnlyGate } from "./desktop-only-gate";

// Overrides the shared always-false matchMedia from vitest.setup.ts: this
// suite is specifically about the mobile breakpoint actually matching.
vi.stubGlobal(
  "matchMedia",
  vi.fn().mockImplementation((query: string) => ({
    matches: query === "(max-width: 768px)",
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
);

describe("DesktopOnlyGate", () => {
  it("keeps the desktop application mounted behind the mobile requirement", () => {
    render(
      <DesktopOnlyGate>Desktop application</DesktopOnlyGate>,
    );

    expect(
      screen.getByRole("heading", {
        name: "Please use Meld on desktop",
      }),
    ).toBeInTheDocument();
    expect(
      screen.getByText("The web app is not available on mobile yet."),
    ).toBeInTheDocument();
    expect(screen.getByText("Desktop application")).toBeInTheDocument();
    expect(screen.getByText("Desktop application").closest("[aria-hidden=true]")).toBeTruthy();
  });
});
