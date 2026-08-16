// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { SettingsTabs } from "./settings-tabs";

const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const mocks = vi.hoisted(() => ({ pathname: "" }));

vi.mock("next/navigation", () => ({
  usePathname: () => mocks.pathname,
}));

afterEach(() => {
  cleanup();
});

it("links to the members and AI connections settings pages", () => {
  mocks.pathname = `/${WORKSPACE_ID}/settings/members`;
  render(<SettingsTabs workspaceId={WORKSPACE_ID} />);

  expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute(
    "href",
    `/${WORKSPACE_ID}/settings/members`,
  );
  expect(
    screen.getByRole("link", { name: "AI connections" }),
  ).toHaveAttribute("href", `/${WORKSPACE_ID}/settings/devices`);
});

it("marks the tab matching the current page as current", () => {
  mocks.pathname = `/${WORKSPACE_ID}/settings/members`;
  render(<SettingsTabs workspaceId={WORKSPACE_ID} />);
  expect(screen.getByRole("link", { name: "Members" })).toHaveAttribute(
    "aria-current",
    "page",
  );
  expect(
    screen.getByRole("link", { name: "AI connections" }),
  ).not.toHaveAttribute("aria-current");

  cleanup();
  mocks.pathname = `/${WORKSPACE_ID}/settings/devices`;
  render(<SettingsTabs workspaceId={WORKSPACE_ID} />);
  expect(
    screen.getByRole("link", { name: "AI connections" }),
  ).toHaveAttribute("aria-current", "page");
  expect(screen.getByRole("link", { name: "Members" })).not.toHaveAttribute(
    "aria-current",
  );
});
