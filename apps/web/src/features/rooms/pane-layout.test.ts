import { describe, expect, it } from "vitest";
import {
  MAX_PANES,
  canPlace,
  classifyRegion,
  insertPaneAt,
  movePane,
  paneRefusalReason,
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

describe("classifyRegion", () => {
  it("calls the single-pane plane full", () => {
    expect(classifyRegion(regionsFor(1)[0])).toBe("full");
  });

  it("calls both two-pane regions half", () => {
    for (const region of regionsFor(2)) {
      expect(classifyRegion(region)).toBe("half");
    }
  });

  it("calls the tall left region of three panes half, the other two quarter", () => {
    const [left, topRight, bottomRight] = regionsFor(3);
    expect(classifyRegion(left)).toBe("half");
    expect(classifyRegion(topRight)).toBe("quarter");
    expect(classifyRegion(bottomRight)).toBe("quarter");
  });

  // Proves the invariant the "refused in any four-pane position" rule below
  // relies on. There is no end-to-end test for that rule through canPlace /
  // insertPaneAt: with only three PaneTool values, no four-long PaneLayout
  // can be built without a duplicate, and canPlace's capacity check (already
  // covered elsewhere) refuses any four-long layout before the region check
  // is ever reached. This is as close as the rule gets to a positive test
  // until a fourth tool exists.
  it("calls every four-pane region quarter", () => {
    for (const region of regionsFor(4)) {
      expect(classifyRegion(region)).toBe("quarter");
    }
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
// content, nothing to select. canPlace checks whether *some* index would
// keep every tool -- including canvas, whether newly placed or already
// resident -- out of a quarter; it isn't a blanket refusal above two panes,
// because regionsFor(3) still hands its tall left slot a genuine half.
describe("canPlace / minimum region", () => {
  it("allows canvas alone", () => {
    expect(canPlace([], "canvas")).toBe(true);
  });

  it("allows canvas as one of two panes, in either direction", () => {
    expect(canPlace(["canvas"], "prototype")).toBe(true);
    expect(canPlace(["prototype"], "canvas")).toBe(true);
  });

  it("allows canvas into a would-be three-pane tab, since index 0 stays a half", () => {
    expect(canPlace(["prototype", "prd"], "canvas")).toBe(true);
  });

  it("allows a third pane onto a tab canvas already holds one of two, since canvas can keep index 0", () => {
    expect(canPlace(["canvas", "prototype"], "prd")).toBe(true);
  });
});

describe("paneRefusalReason", () => {
  it("names the duplicate tool", () => {
    expect(paneRefusalReason(["prd"], "prd", 0)).toBe(
      "prd is already open in this tab.",
    );
  });

  // Like canPlace's MAX_PANES branch, the "tab is full" message has no
  // reachable positive test with only three PaneTool values: a four-long
  // layout can't be built without repeating one of the three, and whichever
  // tool gets queried against it is then caught by the duplicate-tool
  // message first.

  it("explains a refusal at a specific quarter index, even though the tool could go elsewhere", () => {
    expect(paneRefusalReason(["prototype", "prd"], "canvas", 1)).toBe(
      "Canvas needs at least half the plane to stay usable, so it can't go there.",
    );
  });

  it("returns null when the requested index is allowed", () => {
    expect(paneRefusalReason(["prototype", "prd"], "canvas", 0)).toBeNull();
    expect(paneRefusalReason(["canvas"], "prototype", 1)).toBeNull();
  });
});

describe("insertPaneAt", () => {
  it("inserts at the given index", () => {
    expect(insertPaneAt(["canvas", "prd"], "prototype", 1)).toEqual([
      "canvas",
      "prototype",
      "prd",
    ]);
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

describe("insertPaneAt / minimum region", () => {
  it("allows canvas at index 0 of a three-pane tab", () => {
    expect(insertPaneAt(["prototype", "prd"], "canvas", 0)).toEqual([
      "canvas",
      "prototype",
      "prd",
    ]);
  });

  it("refuses canvas at index 1 or index 2 of a three-pane tab", () => {
    const panes: PaneLayout = ["prototype", "prd"];
    expect(insertPaneAt(panes, "canvas", 1)).toEqual(panes);
    expect(insertPaneAt(panes, "canvas", 2)).toEqual(panes);
  });

  it("refuses an index that would bump an already-placed canvas into a quarter", () => {
    // canvas already legally holds index 0 here; inserting prd at index 0
    // would push canvas to index 1, a quarter, even though prd itself has
    // no minimum of its own.
    const panes: PaneLayout = ["canvas", "prototype"];
    expect(insertPaneAt(panes, "prd", 0)).toEqual(panes);
  });

  it("lets prd and prototype land in a quarter slot beside a validly-placed canvas", () => {
    expect(insertPaneAt(["canvas", "prototype"], "prd", 1)).toEqual([
      "canvas",
      "prd",
      "prototype",
    ]);
    expect(insertPaneAt(["canvas", "prototype"], "prd", 2)).toEqual([
      "canvas",
      "prototype",
      "prd",
    ]);
  });
});

describe("movePane", () => {
  it("moves a pane to a later index", () => {
    expect(movePane(["prototype", "prd"], 0, 1)).toEqual(["prd", "prototype"]);
  });

  it("moves a pane to an earlier index", () => {
    expect(movePane(["prototype", "prd"], 1, 0)).toEqual(["prd", "prototype"]);
  });

  it("ignores a move that goes nowhere", () => {
    expect(movePane(["canvas", "prd"], 1, 1)).toEqual(["canvas", "prd"]);
  });
});

describe("movePane / minimum region", () => {
  it("refuses to move canvas out of index 0 of a three-pane tab into a quarter", () => {
    const panes: PaneLayout = ["canvas", "prototype", "prd"];
    expect(movePane(panes, 0, 1)).toEqual(panes);
    expect(movePane(panes, 0, 2)).toEqual(panes);
  });

  it("lets the other two panes trade places between the two quarter slots", () => {
    expect(movePane(["canvas", "prototype", "prd"], 1, 2)).toEqual([
      "canvas",
      "prd",
      "prototype",
    ]);
    expect(movePane(["canvas", "prototype", "prd"], 2, 1)).toEqual([
      "canvas",
      "prd",
      "prototype",
    ]);
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
