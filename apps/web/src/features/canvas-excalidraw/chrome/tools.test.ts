import { describe, expect, it } from "vitest";
import { activeToolFor, DOCK_GROUPS, DOCK_TOOLS, dockToolForActive, isShapeTool, SHAPE_TOOLS } from "./tools";

describe("dock tools", () => {
  it("lists the dock in order", () => {
    expect(DOCK_TOOLS.map((entry) => entry.tool)).toEqual(["select", "hand", "frame", "pen", "rectangle", "ellipse", "triangle", "diamond", "line", "arrow", "text", "image", "eraser"]);
  });
  it("maps to and from Excalidraw's active tool", () => {
    for (const { tool } of DOCK_TOOLS) expect(dockToolForActive(activeToolFor(tool))).toBe(tool);
    expect(activeToolFor("pen")).toEqual({ type: "freedraw" });
    expect(activeToolFor("line")).toEqual({ type: "line" });
    // Excalidraw has no triangle tool, so Orion's own is a custom one.
    expect(activeToolFor("triangle")).toEqual({ type: "custom", customType: "triangle" });
    expect(dockToolForActive({ type: "laser" })).toBeNull();
    expect(dockToolForActive({ type: "custom", customType: "something-else" })).toBeNull();
  });
  it("groups the dock and folds every shape tool into one Shapes entry", () => {
    expect(SHAPE_TOOLS).toEqual(["rectangle", "ellipse", "triangle", "diamond", "line", "arrow"]);
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
    expect(isShapeTool("triangle")).toBe(true);
    expect(isShapeTool("pen")).toBe(false);
    expect(isShapeTool(null)).toBe(false);
  });
});
