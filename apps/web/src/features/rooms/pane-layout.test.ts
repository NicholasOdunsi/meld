import { describe, expect, it } from "vitest";
import {
  MAX_PANES,
  canPlace,
  insertPaneAt,
  movePane,
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

  it("refuses anything once the tab holds four panes", () => {
    const full: PaneLayout = ["canvas", "prototype", "prd"];
    expect(full.length).toBeLessThan(MAX_PANES);
    expect(canPlace(full, "canvas")).toBe(false);
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
