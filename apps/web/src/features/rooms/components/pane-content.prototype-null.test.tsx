// @vitest-environment jsdom

/**
 * `PaneContent`'s own `prototype-viewer` mock (see `pane-content.test.tsx`)
 * hides a real crash: `data.prototype === null` is a value `RoomPaneData`'s
 * type explicitly allows, and `PaneContent`'s `surfaceProps` widens a `null`
 * surface to `{}` before spreading it onto the real component. The real
 * `PrototypeViewer` used to read `screens[0]` unconditionally, so a `{}`
 * spread (no `screens` at all) threw. This file renders the *real*
 * `PrototypeViewer` -- nothing here is mocked -- so it is the seam that
 * would have caught that.
 */

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PaneContent } from "./pane-content";

afterEach(cleanup);

it("does not crash when the prototype surface is null", () => {
  expect(() =>
    render(
      <PaneContent
        tool="prototype"
        data={{ prd: null, prototype: null, canvas: null }}
      />,
    ),
  ).not.toThrow();

  // With no props at all reaching it, the real viewer has nothing to build a
  // prototype from -- it must land on its empty state, not a blank pane.
  expect(screen.getByText("No screens built yet")).toBeInTheDocument();
});
