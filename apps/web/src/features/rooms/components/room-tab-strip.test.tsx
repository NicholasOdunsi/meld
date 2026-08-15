// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoomTabStrip } from "./room-tab-strip";
import type { RoomSurfaceState } from "../surfaces";

afterEach(cleanup);

const EMPTY_STATE: RoomSurfaceState = {
  hasUserFlow: false,
  hasPrd: false,
  hasPrdTask: false,
  hasBuiltDesignScreen: false,
  decisionCount: 0,
  stage: "discovery",
};

describe("RoomTabStrip", () => {
  it("renders no tab strip for a Conversation-only Room", () => {
    render(
      <RoomTabStrip
        activeSurface="conversation"
        surfaceState={EMPTY_STATE}
        basePath="/o/rooms/r"
      />,
    );
    expect(
      screen.queryByRole("navigation", { name: "Room surfaces" }),
    ).toBeNull();
  });

  it("shows artifact surfaces only as their durable state emerges", () => {
    const { rerender } = render(
      <RoomTabStrip
        activeSurface="conversation"
        surfaceState={{ ...EMPTY_STATE, hasUserFlow: true }}
        basePath="/o/rooms/r"
      />,
    );
    expect(screen.queryByRole("link", { name: /PRD/ })).toBeNull();
    expect(
      screen.getByRole("navigation", { name: "Room surfaces" }),
    ).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Canvas/ })).toHaveAttribute(
      "href",
      "/o/rooms/r?tab=user-flows",
    );

    rerender(
      <RoomTabStrip
        activeSurface="conversation"
        surfaceState={{ ...EMPTY_STATE, hasPrd: true, decisionCount: 1 }}
        basePath="/o/rooms/r"
      />,
    );
    expect(screen.getByRole("link", { name: /PRD/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Decisions/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Overview/ })).toBeInTheDocument();
  });

  it("links to Prototype when a built design screen exists", () => {
    render(
      <RoomTabStrip
        activeSurface="conversation"
        surfaceState={{ ...EMPTY_STATE, hasBuiltDesignScreen: true }}
        basePath="/o/rooms/r"
      />,
    );

    expect(screen.getByRole("link", { name: /Prototype/ })).toHaveAttribute(
      "href",
      "/o/rooms/r?tab=prototype",
    );
  });

  it("keeps the committed tab selected while its link is loading", () => {
    render(
      <RoomTabStrip
        activeSurface="conversation"
        surfaceState={{ ...EMPTY_STATE, hasPrd: true }}
        basePath="/o/rooms/r"
      />,
    );

    const conversationTab = screen.getByRole("link", {
      name: /Conversation/,
    });
    const prdTab = screen.getByRole("link", { name: /PRD/ });

    expect(conversationTab).toHaveAttribute("aria-current", "page");
    expect(prdTab).toHaveAttribute(
      "href",
      "/o/rooms/r?tab=prd",
    );
    expect(prdTab).not.toHaveAttribute("to");
    prdTab.addEventListener("click", (event) => event.preventDefault());
    conversationTab.addEventListener("click", (event) =>
      event.preventDefault(),
    );
    fireEvent.click(prdTab);
    expect(conversationTab).toHaveAttribute("aria-current", "page");
    expect(prdTab).not.toHaveAttribute("aria-current");
  });

  it("resynchronizes selection when the URL-backed active tab changes", async () => {
    const { rerender } = render(
      <RoomTabStrip
        activeSurface="conversation"
        surfaceState={{ ...EMPTY_STATE, hasPrd: true }}
        basePath="/o/rooms/r"
      />,
    );

    rerender(
      <RoomTabStrip
        activeSurface="prd"
        surfaceState={{ ...EMPTY_STATE, hasPrd: true }}
        basePath="/o/rooms/r"
      />,
    );
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /PRD/ })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
    rerender(
      <RoomTabStrip
        activeSurface="conversation"
        surfaceState={{ ...EMPTY_STATE, hasPrd: true }}
        basePath="/o/rooms/r"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /Conversation/ }),
      ).toHaveAttribute("aria-current", "page"),
    );
  });
});
