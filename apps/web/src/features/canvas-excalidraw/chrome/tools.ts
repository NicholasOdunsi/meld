export type DockTool = "select" | "hand" | "frame" | "pen" | "rectangle" | "ellipse" | "arrow" | "text" | "image" | "eraser";
type ExcalidrawTool = "selection" | "hand" | "frame" | "freedraw" | "rectangle" | "ellipse" | "arrow" | "text" | "image" | "eraser";

export const DOCK_TOOLS: readonly { tool: DockTool; label: string; shortcut: string }[] = [
  { tool: "select", label: "Select", shortcut: "V" },
  { tool: "hand", label: "Hand", shortcut: "H" },
  { tool: "frame", label: "Frame", shortcut: "F" },
  { tool: "pen", label: "Pen", shortcut: "P" },
  { tool: "rectangle", label: "Rectangle", shortcut: "R" },
  { tool: "ellipse", label: "Ellipse", shortcut: "O" },
  { tool: "arrow", label: "Arrow", shortcut: "A" },
  { tool: "text", label: "Text", shortcut: "T" },
  { tool: "image", label: "Image", shortcut: "9" },
  { tool: "eraser", label: "Eraser", shortcut: "E" },
];

const TO_EXCALIDRAW: Record<DockTool, ExcalidrawTool> = {
  select: "selection", hand: "hand", frame: "frame", pen: "freedraw", rectangle: "rectangle",
  ellipse: "ellipse", arrow: "arrow", text: "text", image: "image", eraser: "eraser",
};

export function excalidrawToolFor(tool: DockTool): ExcalidrawTool {
  return TO_EXCALIDRAW[tool];
}

export function dockToolFor(excalidrawType: string): DockTool | null {
  const match = (Object.entries(TO_EXCALIDRAW) as [DockTool, ExcalidrawTool][]).find(([, type]) => type === excalidrawType);
  return match ? match[0] : null;
}

// Rectangle, ellipse and arrow share one dock button so the column stays short.
export type ShapeTool = "rectangle" | "ellipse" | "arrow";
export const SHAPE_TOOLS: readonly ShapeTool[] = ["rectangle", "ellipse", "arrow"];

export function isShapeTool(tool: DockTool | null): tool is ShapeTool {
  return tool !== null && (SHAPE_TOOLS as readonly string[]).includes(tool);
}

// The dock's rows, top to bottom. A divider sits between the two groups.
export const DOCK_GROUPS: readonly (readonly (Exclude<DockTool, ShapeTool> | "shapes")[])[] = [
  ["select", "hand"],
  ["frame", "pen", "shapes", "text", "image", "eraser"],
];
