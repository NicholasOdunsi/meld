// @vitest-environment jsdom

import "@testing-library/jest-dom/vitest";
import { cleanup, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { DiscoveryRoomHeader } from "./components/discovery-room-header";

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

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const originalMatches = HTMLElement.prototype.matches;
const popoverOpenState = new WeakMap<HTMLElement, boolean>();

beforeAll(() => {
  HTMLElement.prototype.showPopover = vi.fn(function (
    this: HTMLElement,
  ) {
    popoverOpenState.set(this, true);
    const event = new Event("toggle");
    Object.defineProperty(event, "newState", { value: "open" });
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.hidePopover = vi.fn(function (
    this: HTMLElement,
  ) {
    popoverOpenState.set(this, false);
    const event = new Event("toggle");
    Object.defineProperty(event, "newState", { value: "closed" });
    this.dispatchEvent(event);
  });
  HTMLElement.prototype.matches = function (selector: string) {
    if (selector === ":popover-open") {
      return popoverOpenState.get(this) ?? false;
    }
    return originalMatches.call(this, selector);
  };
});

afterAll(() => {
  HTMLElement.prototype.matches = originalMatches;
  cleanup();
});

it("shows a compact private-room identity and the complete roster", async () => {
  const user = userEvent.setup();

  render(
    <DiscoveryRoomHeader
      roomName="Customer interviews"
      currentUserId="user-1"
      participants={[
        {
          userId: "user-1",
          email: "owner@example.com",
          access: "edit",
        },
        {
          userId: "user-2",
          email: "maya@example.com",
          access: "view",
        },
        {
          userId: "user-3",
          email: "sam@example.com",
          access: "view",
        },
      ]}
    />,
  );

  expect(
    screen.getByRole("heading", { name: "Customer interviews" }),
  ).toBeVisible();
  expect(screen.getByTestId("private-room-icon")).toBeVisible();
  expect(
    screen.queryByText(/Private to explicit room participants/i),
  ).not.toBeInTheDocument();

  const trigger = screen.getByRole("button", {
    name: "5 room participants",
  });
  const visibleParticipants = within(
    screen.getByTestId("visible-room-participants"),
  );
  const visibleAvatars = visibleParticipants.getAllByRole("img");

  expect(visibleAvatars).toHaveLength(3);
  expect(visibleAvatars[0]).toHaveAccessibleName("owner@example.com");
  expect(visibleAvatars[1]).toHaveAccessibleName("Product Agent");
  expect(visibleAvatars[2]).toHaveAccessibleName("Research Agent");

  await user.click(trigger);

  expect(trigger).toHaveAttribute("aria-expanded", "true");
  const popover = screen.getByRole("dialog", {
    name: "Room participants",
    hidden: true,
  });
  expect(
    within(popover).queryByRole("button", { name: "Close popover" }),
  ).not.toBeInTheDocument();
  expect(within(popover).getByText("Product Agent")).toBeInTheDocument();
  expect(within(popover).getByText("Research Agent")).toBeInTheDocument();
  expect(within(popover).getAllByText("Agent · UI only")).toHaveLength(2);
  expect(within(popover).getByText("owner@example.com")).toBeInTheDocument();
  expect(within(popover).getByText("maya@example.com")).toBeInTheDocument();
  expect(within(popover).getByText("sam@example.com")).toBeInTheDocument();
});
