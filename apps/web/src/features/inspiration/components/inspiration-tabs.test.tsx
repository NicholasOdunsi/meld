// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { InspirationTabs } from "./inspiration-tabs";

afterEach(cleanup);

describe("InspirationTabs", () => {
  it("links Library and Your taste", () => {
    render(<InspirationTabs workspaceId="ws" active="taste" />);
    expect(screen.getByRole("link", { name: "Library" })).toHaveAttribute("href", "/ws/inspiration");
    expect(screen.getByRole("link", { name: "Your taste" })).toHaveAttribute("href", "/ws/inspiration?tab=taste");
    expect(screen.getByRole("link", { name: "Your taste" })).toHaveAttribute("aria-current", "page");
  });
});
