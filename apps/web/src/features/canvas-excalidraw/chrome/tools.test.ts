import { describe, expect, it } from "vitest";
import { DOCK_GROUPS, DOCK_TOOLS, dockToolFor, excalidrawToolFor, isShapeTool, SHAPE_MENU, SHAPE_TOOLS } from "./tools";

describe("dock tools", () => {
  it("lists the dock in order", () => {
    expect(DOCK_TOOLS.map((entry) => entry.tool)).toEqual(["select", "hand", "frame", "pen", "rectangle", "ellipse", "diamond", "line", "arrow", "text", "image", "eraser"]);
  });
  it("maps to and from Excalidraw tool types", () => {
    for (const { tool } of DOCK_TOOLS) expect(dockToolFor(excalidrawToolFor(tool))).toBe(tool);
    expect(excalidrawToolFor("pen")).toBe("freedraw");
    expect(dockToolFor("laser")).toBeNull();
  });
  it("groups the dock and folds the three shape tools into one Shapes entry", () => {
    expect(SHAPE_TOOLS).toEqual(["rectangle", "ellipse", "diamond", "line", "arrow"]);
    // Triangle is not an Excalidraw tool: the menu offers it as a one-click insert.
    expect(SHAPE_MENU).toEqual(["rectangle", "ellipse", "triangle", "diamond", "line", "arrow"]);
    expect(excalidrawToolFor("line")).toBe("line");
    expect(excalidrawToolFor("diamond")).toBe("diamond");
    expect(DOCK_GROUPS).toEqual([
      ["select", "hand"],
      ["frame", "pen", "shapes", "text", "image", "eraser"],
    ]);
    // Every tool is reachable exactly once, either directly or through Shapes.
    const reachable = DOCK_GROUPS.flat().flatMap((entry): readonly string[] => (entry === "shapes" ? SHAPE_TOOLS : [entry]));
    expect([...reachable].sort()).toEqual(DOCK_TOOLS.map((entry) => entry.tool).sort());
  });
  it("knows which tools are shapes", () => {
    expect(isShapeTool("ellipse")).toBe(true);
    expect(isShapeTool("pen")).toBe(false);
    expect(isShapeTool(null)).toBe(false);
  });
});
