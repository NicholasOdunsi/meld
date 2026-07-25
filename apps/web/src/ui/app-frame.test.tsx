// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import {
  SideNav,
  SideNavItem,
} from "@astryxdesign/core/SideNav";
import { render, screen } from "@testing-library/react";
import { expect, it, vi } from "vitest";
import { AppFrame } from "./app-frame";

const matchMedia = vi.fn().mockImplementation((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}));

vi.stubGlobal("matchMedia", matchMedia);

it("provides one application main region and navigation", () => {
  localStorage.clear();

  render(
    <AppFrame
      navigation={
        <SideNav>
          <SideNavItem
            label="Discovery"
            href="/discovery"
          />
        </SideNav>
      }
    >
      <h1>Home</h1>
    </AppFrame>,
  );

  const main = screen.getByRole("main");
  const navigation = screen.getByRole("navigation");

  expect(main).toBeVisible();
  expect(main.closest("[data-variant='section']")).toBeInTheDocument();
  expect(navigation).toBeVisible();
  expect(screen.getByRole("link", { name: "Discovery" })).toBeVisible();
  expect(matchMedia).toHaveBeenCalledWith("(max-width: 768px)");
});
