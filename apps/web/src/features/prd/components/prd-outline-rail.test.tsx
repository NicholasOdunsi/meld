// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { PrdOutlineRail } from "./prd-outline-rail";

afterEach(cleanup);

it("scrolls the selected outline heading into view", () => {
  const scrollIntoView = vi.fn();
  render(
    <>
      <h2 id="executive-summary">Executive summary</h2>
      <h2 id="dependencies">Dependencies & constraints</h2>
      <PrdOutlineRail
        items={[
          { id: "executive-summary", label: "Executive summary" },
          { id: "dependencies", label: "Dependencies & constraints" },
        ]}
      />
    </>,
  );
  const target = document.getElementById("dependencies");
  Object.defineProperty(target, "scrollIntoView", {
    configurable: true,
    value: scrollIntoView,
  });

  fireEvent.mouseEnter(screen.getByTestId("prd-outline-rail"));
  fireEvent.click(
    screen.getByRole("button", { name: "Dependencies & constraints" }),
  );

  expect(scrollIntoView).toHaveBeenCalledWith({
    behavior: "smooth",
    block: "start",
  });
});

it("anchors to its own surface, not the browser window", () => {
  // The document now lives in a Room pane that can be moved and resized. A
  // viewport-fixed rail stays glued to the window edge while its pane moves
  // out from under it -- which is what "the rail does not follow its document"
  // looked like after rearranging panes.
  render(
    <PrdOutlineRail items={[{ id: "executive-summary", label: "Executive summary" }]} />,
  );
  const rail = screen.getByTestId("prd-outline-rail");
  // sticky, not fixed: fixed anchors to the browser window, so the rail stayed
  // put when its pane moved. sticky is scoped to the document's own scroll
  // container -- it travels with the pane AND stays pinned while the document
  // scrolls underneath it, which absolute alone would not do.
  expect(rail.style.position).toBe("sticky");
});

