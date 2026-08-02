// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import type { ComponentProps } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { RoomTabStrip } from "./room-tab-strip";
import { parseRoomTab } from "./room-tabs";

vi.mock("next/link", () => ({
  default: ({
    to,
    onClick,
    ...props
  }: ComponentProps<"a"> & { to?: string }) => {
    void to;
    return (
      <a
        {...props}
        data-router-link=""
        onClick={(event) => {
          event.preventDefault();
          onClick?.(event);
        }}
      />
    );
  },
}));

afterEach(cleanup);

describe("parseRoomTab", () => {
  it("defaults to conversation", () => {
    expect(parseRoomTab(undefined, true)).toBe("conversation");
  });
  it("clamps prd to conversation when no PRD exists", () => {
    expect(parseRoomTab("prd", false)).toBe("conversation");
  });
  it("honors prd when a PRD exists", () => {
    expect(parseRoomTab("prd", true)).toBe("prd");
  });
});

describe("RoomTabStrip", () => {
  it("hides the PRD tab until a PRD exists", () => {
    const { rerender } = render(
      <RoomTabStrip activeTab="conversation" hasPrd={false} basePath="/o/discovery/r" />,
    );
    // Astryx's Tab renders its label in two internal spans (a visible one
    // plus an aria-hidden bold-weight clone used to reserve width), so
    // getByText("PRD") would match twice once the tab exists. Query by the
    // tab's accessible role/name instead.
    expect(screen.queryByRole("link", { name: /PRD/ })).toBeNull();
    rerender(
      <RoomTabStrip activeTab="conversation" hasPrd basePath="/o/discovery/r" />,
    );
    expect(screen.getByRole("link", { name: /PRD/ })).toBeInTheDocument();
  });

  it("selects a tab immediately when its link is clicked", () => {
    render(
      <RoomTabStrip
        activeTab="conversation"
        hasPrd
        basePath="/o/discovery/r"
      />,
    );

    const conversationTab = screen.getByRole("link", {
      name: /Conversation/,
    });
    const prdTab = screen.getByRole("link", { name: /PRD/ });

    expect(conversationTab).toHaveAttribute("aria-current", "page");
    expect(prdTab).toHaveAttribute("data-router-link");
    expect(prdTab).toHaveAttribute(
      "href",
      "/o/discovery/r?tab=prd",
    );
    fireEvent.click(prdTab);
    expect(prdTab).toHaveAttribute("aria-current", "page");
    expect(conversationTab).not.toHaveAttribute("aria-current");

    fireEvent.click(conversationTab);
    expect(conversationTab).toHaveAttribute("aria-current", "page");
    expect(prdTab).not.toHaveAttribute("aria-current");
  });

  it("resynchronizes selection when the URL-backed active tab changes", async () => {
    const { rerender } = render(
      <RoomTabStrip
        activeTab="conversation"
        hasPrd
        basePath="/o/discovery/r"
      />,
    );

    fireEvent.click(screen.getByRole("link", { name: /PRD/ }));
    rerender(
      <RoomTabStrip activeTab="prd" hasPrd basePath="/o/discovery/r" />,
    );
    rerender(
      <RoomTabStrip
        activeTab="conversation"
        hasPrd
        basePath="/o/discovery/r"
      />,
    );

    await waitFor(() =>
      expect(
        screen.getByRole("link", { name: /Conversation/ }),
      ).toHaveAttribute("aria-current", "page"),
    );
  });
});
