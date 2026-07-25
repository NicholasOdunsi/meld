// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { render, screen } from "@testing-library/react";
import Link from "next/link";
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
    <AppFrame navigation={<Link href="/discovery">Discovery</Link>}>
      <h1>Home</h1>
    </AppFrame>,
  );

  const main = screen.getByRole("main");
  const navigation = screen.getByRole("navigation");
  const resizeHandle = screen.getByTestId("astryx-sidenav-resize-handle");

  expect(main).toBeVisible();
  expect(main.closest("[data-variant='section']")).toBeInTheDocument();
  expect(screen.getByRole("link", { name: "Discovery" })).toBeVisible();
  expect(screen.getByRole("button", { name: /collapse/i })).toBeVisible();
  expect(resizeHandle).toHaveAttribute("aria-valuemin", "220");
  expect(resizeHandle).toHaveAttribute("aria-valuenow", "256");
  expect(resizeHandle).toHaveAttribute("aria-valuemax", "320");
  expect(navigation.style.width).toBe(
    `${resizeHandle.getAttribute("aria-valuenow")}px`,
  );
  expect(localStorage.getItem("astryx-resizable:meld-side-nav")).toBe("256");
  expect(matchMedia).toHaveBeenCalledWith("(max-width: 768px)");
});
