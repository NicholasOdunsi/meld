import { describe, expect, it } from "vitest";
import { DOCK_TOOLS, dockToolFor, excalidrawToolFor } from "./tools";

describe("dock tools", () => {
  it("lists the dock in order", () => {
    expect(DOCK_TOOLS.map((entry) => entry.tool)).toEqual(["select", "hand", "frame", "pen", "rectangle", "ellipse", "arrow", "text", "image", "eraser"]);
  });
  it("maps to and from Excalidraw tool types", () => {
    for (const { tool } of DOCK_TOOLS) expect(dockToolFor(excalidrawToolFor(tool))).toBe(tool);
    expect(excalidrawToolFor("pen")).toBe("freedraw");
    expect(dockToolFor("laser")).toBeNull();
  });
});
