// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppFrame } from "./app-frame";

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

it("provides one application main region and navigation", () => {
  render(
    <AppFrame navigation={<a href="/discovery">Discovery</a>}>
      <h1>Home</h1>
    </AppFrame>,
  );

  expect(screen.getByRole("main")).toBeVisible();
  expect(screen.getByRole("link", { name: "Discovery" })).toBeVisible();
});
