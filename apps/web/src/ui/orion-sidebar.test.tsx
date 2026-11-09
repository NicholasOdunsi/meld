// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("next/navigation", () => ({
  usePathname: () => "/30000000-0000-4000-8000-000000000003",
  useSearchParams: () => new URLSearchParams(),
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/activity/actions", () => ({
  getWorkspaceActivity: vi.fn().mockResolvedValue([]),
}));

import { OrionSidebar } from "./orion-sidebar";

afterEach(cleanup);

describe("OrionSidebar", () => {
  it("the first nav item is labelled Overview", () => {
    render(
      <OrionSidebar
        workspaceId="30000000-0000-4000-8000-000000000003"
        projects={[]}
        rooms={[]}
      />,
    );
    const nav = screen.getByTestId("orion-sidebar");
    const links = nav.querySelectorAll("a");
    // Header "Orion" link first, then Overview as the first personal nav item.
    expect(screen.getByRole("link", { name: "Overview" })).toBeInTheDocument();
    expect(links[1]).toHaveTextContent("Overview");
  });
});
