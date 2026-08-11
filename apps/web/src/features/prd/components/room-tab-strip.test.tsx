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
import { parseRoomTab } from "./room-tabs";

afterEach(cleanup);

describe("parseRoomTab", () => {
  it("defaults to conversation", () => {
    expect(parseRoomTab(undefined, true)).toBe("conversation");
  });
  it("permits the progressive PRD tab before its row materializes", () => {
    expect(parseRoomTab("prd", false)).toBe("prd");
  });
  it("honors prd when a PRD exists", () => {
    expect(parseRoomTab("prd", true)).toBe("prd");
  });
  it("only permits User Flows when the trial is enabled", () => {
    expect(parseRoomTab("user-flows", true)).toBe("conversation");
    expect(parseRoomTab("user-flows", true, true)).toBe("user-flows");
  });
});

describe("RoomTabStrip", () => {
  it("hides the PRD tab until a PRD exists", () => {
    const { rerender } = render(
      <RoomTabStrip activeTab="conversation" hasPrd={false} basePath="/o/rooms/r" />,
    );
    // Astryx's Tab renders its label in two internal spans (a visible one
    // plus an aria-hidden bold-weight clone used to reserve width), so
    // getByText("PRD") would match twice once the tab exists. Query by the
    // tab's accessible role/name instead.
    expect(screen.queryByRole("link", { name: /PRD/ })).toBeNull();
    rerender(
      <RoomTabStrip activeTab="conversation" hasPrd basePath="/o/rooms/r" />,
    );
    expect(screen.getByRole("link", { name: /PRD/ })).toBeInTheDocument();
  });

  it("shows User Flows only when the trial is enabled", () => {
    const { rerender } = render(
      <RoomTabStrip
        activeTab="conversation"
        hasPrd={false}
        hasUserFlows={false}
        basePath="/o/rooms/r"
      />,
    );
    expect(screen.queryByRole("link", { name: /User Flows/ })).toBeNull();
    rerender(
      <RoomTabStrip
        activeTab="conversation"
        hasPrd={false}
        hasUserFlows
        basePath="/o/rooms/r"
      />,
    );
    expect(screen.getByRole("link", { name: /User Flows/ })).toHaveAttribute(
      "href",
      "/o/rooms/r?tab=user-flows",
    );
  });

  it("keeps the committed tab selected while its link is loading", () => {
    render(
      <RoomTabStrip
        activeTab="conversation"
        hasPrd
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
        activeTab="conversation"
        hasPrd
        basePath="/o/rooms/r"
      />,
    );

    rerender(
      <RoomTabStrip activeTab="prd" hasPrd basePath="/o/rooms/r" />,
    );
    await waitFor(() =>
      expect(screen.getByRole("link", { name: /PRD/ })).toHaveAttribute(
        "aria-current",
        "page",
      ),
    );
    rerender(
      <RoomTabStrip
        activeTab="conversation"
        hasPrd
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
