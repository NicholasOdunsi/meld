import { describe, expect, it } from "vitest";
import { formatSketchLayoutForPrompt } from "./sketch-layout-prompt";
import type { SketchLayout } from "./sketch-layout";

const layout: SketchLayout = {
  boxes: [
    { shapeKind: "rectangle", text: "Start free trial", position: { vertical: "bottom", horizontal: "center" }, size: { width: "wide", height: "short" } },
    { shapeKind: "text", text: "Choose your plan", position: { vertical: "top", horizontal: "left" }, size: { width: "medium", height: "short" } },
  ],
  truncated: false,
};

describe("formatSketchLayoutForPrompt", () => {
  it("lists boxes in order with placement + text", () => {
    const s = formatSketchLayoutForPrompt(layout);
    expect(s).toMatch(/sketch/i);
    expect(s).toContain('wide rectangle at bottom-center: "Start free trial"');
    expect(s).toContain('medium text at top-left: "Choose your plan"');
  });
  it("returns empty string for an empty sketch", () => {
    expect(formatSketchLayoutForPrompt({ boxes: [], truncated: false })).toBe("");
  });
  it("notes truncation when set", () => {
    expect(formatSketchLayoutForPrompt({ boxes: layout.boxes, truncated: true })).toMatch(/additional/i);
  });
});
