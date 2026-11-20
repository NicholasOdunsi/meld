export type DockTool = "select" | "hand" | "frame" | "pen" | "rectangle" | "ellipse" | "triangle" | "diamond" | "line" | "arrow" | "text" | "image" | "eraser";
type ExcalidrawTool = "selection" | "hand" | "frame" | "freedraw" | "rectangle" | "ellipse" | "diamond" | "line" | "arrow" | "text" | "image" | "eraser";

// `shortcut` is empty for tools Excalidraw has no key for.
export const DOCK_TOOLS: readonly { tool: DockTool; label: string; shortcut: string }[] = [
  { tool: "select", label: "Select", shortcut: "V" },
  { tool: "hand", label: "Hand", shortcut: "H" },
  { tool: "frame", label: "Frame", shortcut: "F" },
  { tool: "pen", label: "Pen", shortcut: "P" },
  { tool: "rectangle", label: "Rectangle", shortcut: "R" },
  { tool: "ellipse", label: "Ellipse", shortcut: "O" },
  { tool: "triangle", label: "Triangle", shortcut: "" },
  { tool: "diamond", label: "Diamond", shortcut: "D" },
  { tool: "line", label: "Line", shortcut: "L" },
  { tool: "arrow", label: "Arrow", shortcut: "A" },
  { tool: "text", label: "Text", shortcut: "T" },
  { tool: "image", label: "Image", shortcut: "9" },
  { tool: "eraser", label: "Eraser", shortcut: "E" },
];

const TO_EXCALIDRAW: Record<Exclude<DockTool, "triangle">, ExcalidrawTool> = {
  select: "selection", hand: "hand", frame: "frame", pen: "freedraw", rectangle: "rectangle",
  ellipse: "ellipse", diamond: "diamond", line: "line", arrow: "arrow", text: "text", image: "image", eraser: "eraser",
};

export const TRIANGLE_TOOL = "triangle";
export type ActiveToolArg = { type: ExcalidrawTool } | { type: "custom"; customType: typeof TRIANGLE_TOOL };

// What to hand Excalidraw's setActiveTool. Excalidraw has no triangle, so
// Orion's own drawing (use-triangle-tool.ts) runs as a custom tool.
export function activeToolFor(tool: DockTool): ActiveToolArg {
  return tool === "triangle" ? { type: "custom", customType: TRIANGLE_TOOL } : { type: TO_EXCALIDRAW[tool] };
}

export function dockToolForActive(active: { type: string; customType?: string | null }): DockTool | null {
  if (active.type === "custom") return active.customType === TRIANGLE_TOOL ? "triangle" : null;
  const match = (Object.entries(TO_EXCALIDRAW) as [DockTool, ExcalidrawTool][]).find(([, type]) => type === active.type);
  return match ? match[0] : null;
}

// Every shape shares one dock button so the column stays short.
export type ShapeTool = "rectangle" | "ellipse" | "triangle" | "diamond" | "line" | "arrow";
export const SHAPE_TOOLS: readonly ShapeTool[] = ["rectangle", "ellipse", "triangle", "diamond", "line", "arrow"];

export function isShapeTool(tool: DockTool | null): tool is ShapeTool {
  return tool !== null && (SHAPE_TOOLS as readonly string[]).includes(tool);
}

// The dock's rows, top to bottom. A divider sits between the two groups.
export const DOCK_GROUPS: readonly (readonly (Exclude<DockTool, ShapeTool> | "shapes")[])[] = [
  ["select", "hand"],
  ["frame", "pen", "shapes", "text", "image", "eraser"],
];
