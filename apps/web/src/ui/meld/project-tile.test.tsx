// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldProjectTile } from "./project-tile";

afterEach(cleanup);

it("shows the name and what is inside", () => {
  render(
    <MeldProjectTile
      name="Checkout redesign"
      color="blue"
      roomCount={3}
      updatedLabel="2h"
    />,
  );

  expect(screen.getByText("Checkout redesign")).toBeInTheDocument();
  expect(screen.getByText("3 rooms · 2h")).toBeInTheDocument();
});

it("says one room in the singular", () => {
  render(
    <MeldProjectTile name="Growth" color="green" roomCount={1} updatedLabel="2w" />,
  );

  expect(screen.getByText("1 room · 2w")).toBeInTheDocument();
});

it("flags a live agent and an unread count", () => {
  render(
    <MeldProjectTile
      name="Checkout redesign"
      color="blue"
      roomCount={3}
      updatedLabel="2h"
      isLive
      unreadCount={3}
    />,
  );

  expect(screen.getByText("LIVE")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
});

it("renders the live marker and the unread badge as distinct, independently targetable elements", () => {
  render(
    <MeldProjectTile
      name="Checkout redesign"
      color="blue"
      roomCount={3}
      updatedLabel="2h"
      isLive
      unreadCount={3}
    />,
  );

  const live = screen.getByTestId("tile-live");
  const unread = screen.getByTestId("tile-unread");

  // Regression guard: the live marker and the unread badge must be two
  // separate elements with their own stable hooks (one at the leading
  // corner, one at the trailing corner), not a single shared node or two
  // nodes that only differ by text content. A test that merely asserted
  // both pieces of text render would not catch them sharing a position.
  expect(live).not.toBe(unread);
  expect(live).toHaveTextContent("LIVE");
  expect(unread).toHaveTextContent("3");
});

it("hides the unread badge at zero", () => {
  render(
    <MeldProjectTile
      name="Growth"
      color="green"
      roomCount={1}
      updatedLabel="2w"
      unreadCount={0}
    />,
  );

  expect(screen.queryByTestId("tile-unread")).not.toBeInTheDocument();
});
