import { describe, expect, it } from "vitest";
import {
  MAX_PANES,
  canPlace,
  insertPaneAt,
  movePane,
  placementRefusalReason,
  regionsFor,
  removePane,
  type PaneLayout,
} from "./pane-layout";

describe("regionsFor", () => {
  it("gives an empty plane no regions", () => {
    expect(regionsFor(0)).toEqual([]);
  });

  it("lets a single pane fill the plane", () => {
    expect(regionsFor(1)).toEqual([
      { columnStart: 1, columnEnd: 3, rowStart: 1, rowEnd: 3 },
    ]);
  });

  it("splits two panes left and right", () => {
    expect(regionsFor(2)).toEqual([
      { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 3 },
      { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 3 },
    ]);
  });

  it("gives three panes a full-height left and a split right", () => {
    expect(regionsFor(3)).toEqual([
      { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 3 },
      { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 2 },
      { columnStart: 2, columnEnd: 3, rowStart: 2, rowEnd: 3 },
    ]);
  });

  it("quarters four panes reading left to right, top to bottom", () => {
    expect(regionsFor(4)).toEqual([
      { columnStart: 1, columnEnd: 2, rowStart: 1, rowEnd: 2 },
      { columnStart: 2, columnEnd: 3, rowStart: 1, rowEnd: 2 },
      { columnStart: 1, columnEnd: 2, rowStart: 2, rowEnd: 3 },
      { columnStart: 2, columnEnd: 3, rowStart: 2, rowEnd: 3 },
    ]);
  });

  it("refuses a count it has no layout for", () => {
    expect(() => regionsFor(5)).toThrow("regionsFor: 5 panes has no layout");
  });
});

describe("canPlace", () => {
  it("allows a tool that is not open", () => {
    expect(canPlace(["prd"], "canvas")).toBe(true);
  });

  // One pane per tool per tab. Two PRD panes would be two windows onto one
  // document; pop-to-new-tab is how you get a second view.
  it("refuses a tool already open in this tab", () => {
    expect(canPlace(["prd"], "prd")).toBe(false);
  });

  // MAX_PANES is 4 as headroom for a future fourth tool. With only three tools
  // and one pane per tool per tab, a valid layout can never reach that ceiling.
  // The capacity-refusal branch of canPlace therefore has no reachable test until
  // a fourth tool exists; this test can only verify duplicate-tool refusal.
  it("refuses a tool that is already open, whatever the layout's size", () => {
    const full: PaneLayout = ["canvas", "prototype", "prd"];
    expect(canPlace(full, "canvas")).toBe(false);
  });
});

// Task 6's width probe found the tldraw-backed canvas tool unusable at a
// quarter (420x260 CSS px at the 1060px reference width): no legible frame
// content, nothing to select. `regionsFor` only ever hands a pane a full
// half at counts 0-2 (plus the tall left slot at count 3); a third pane
// pushes at least one existing pane into a quarter, and `canPlace` can't
// know in advance which one, so it refuses the growth outright whenever
// canvas is on either side of it.
describe("canPlace / half-minimum region", () => {
  it("allows canvas alone", () => {
    expect(canPlace([], "canvas")).toBe(true);
  });

  it("allows canvas as one of two panes, in either direction", () => {
    expect(canPlace(["canvas"], "prototype")).toBe(true);
    expect(canPlace(["prototype"], "canvas")).toBe(true);
  });

  it("refuses a third pane once canvas already holds one of two", () => {
    expect(canPlace(["canvas", "prototype"], "prd")).toBe(false);
  });

  it("refuses placing canvas itself as a third pane", () => {
    expect(canPlace(["prototype", "prd"], "canvas")).toBe(false);
  });

  // With only three PaneTool values today, any three-pane layout must
  // include canvas -- there is no fourth, canvas-free tool to build a
  // "three panes, no half-minimum tool involved" layout from. So, like the
  // MAX_PANES capacity branch above, the "three panes is fine when nothing
  // in it needs a half" branch of `wouldQuarterAHalfMinimumTool` has no
  // reachable positive test until a fourth tool exists.

  it("insertPaneAt honours the refusal instead of inserting anyway", () => {
    const panes: PaneLayout = ["canvas", "prototype"];
    expect(insertPaneAt(panes, "prd", 1)).toEqual(panes);
  });
});

describe("placementRefusalReason", () => {
  it("names the duplicate tool", () => {
    expect(placementRefusalReason(["prd"], "prd")).toBe(
      "prd is already open in this tab.",
    );
  });

  // Like canPlace's MAX_PANES branch, the "tab is full" message has no
  // reachable positive test with only three PaneTool values: a four-long
  // layout can't be built without repeating one of the three, and whichever
  // tool gets queried against it is then caught by the duplicate-tool
  // message first.

  it("explains the half-minimum refusal", () => {
    expect(placementRefusalReason(["canvas", "prototype"], "prd")).toBe(
      "Canvas needs at least half the plane to stay usable, so this tab can't take a third pane while Canvas is open.",
    );
  });

  it("returns null when placement is allowed", () => {
    expect(placementRefusalReason(["canvas"], "prototype")).toBeNull();
  });
});

describe("insertPaneAt", () => {
  // This used to insert a third pane ("prototype" into ["canvas", "prd"] at
  // index 1) to prove mid-array splicing, not just append/prepend. Task 6's
  // half-minimum rule retired that scenario: with only three PaneTool
  // values, any three-pane result includes canvas, and canPlace now refuses
  // that outright (see "canPlace / half-minimum region" above). There is no
  // canvas-free triple to fall back on, so this instead proves an exact,
  // non-negative index 0 inserts at the front -- distinct from the
  // negative-index-clamps-to-front case below, and the closest remaining
  // stand-in for "insertion respects the requested index" now that a true
  // middle position isn't reachable.
  it("inserts at the given index", () => {
    expect(insertPaneAt(["canvas"], "prd", 0)).toEqual(["prd", "canvas"]);
  });

  it("appends when the index is past the end", () => {
    expect(insertPaneAt(["canvas"], "prd", 9)).toEqual(["canvas", "prd"]);
  });

  it("treats a negative index as the front", () => {
    expect(insertPaneAt(["canvas"], "prd", -3)).toEqual(["prd", "canvas"]);
  });

  it("returns the layout untouched when the tool is already open", () => {
    const panes: PaneLayout = ["canvas", "prd"];
    expect(insertPaneAt(panes, "prd", 0)).toEqual(["canvas", "prd"]);
  });

  it("does not mutate the layout it was given", () => {
    const panes: PaneLayout = ["canvas"];
    insertPaneAt(panes, "prd", 1);
    expect(panes).toEqual(["canvas"]);
  });
});

describe("movePane", () => {
  it("moves a pane to a later index", () => {
    expect(movePane(["canvas", "prototype", "prd"], 0, 2)).toEqual([
      "prototype",
      "prd",
      "canvas",
    ]);
  });

  it("moves a pane to an earlier index", () => {
    expect(movePane(["canvas", "prototype", "prd"], 2, 0)).toEqual([
      "prd",
      "canvas",
      "prototype",
    ]);
  });

  it("ignores a move that goes nowhere", () => {
    expect(movePane(["canvas", "prd"], 1, 1)).toEqual(["canvas", "prd"]);
  });
});

describe("removePane", () => {
  it("drops the named tool and reflows the rest", () => {
    expect(removePane(["canvas", "prototype", "prd"], "prototype")).toEqual([
      "canvas",
      "prd",
    ]);
  });

  it("is a no-op for a tool that is not open", () => {
    expect(removePane(["canvas"], "prd")).toEqual(["canvas"]);
  });
});
