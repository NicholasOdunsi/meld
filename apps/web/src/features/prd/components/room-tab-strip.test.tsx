// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { RoomTabStrip, parseRoomTab } from "./room-tab-strip";

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
});
