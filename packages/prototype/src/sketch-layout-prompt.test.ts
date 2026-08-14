import { describe, expect, it } from "vitest";
import { combineInstructionWithLayout, formatSketchLayoutForPrompt } from "./sketch-layout-prompt";
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

describe("combineInstructionWithLayout", () => {
  it("returns the instruction unchanged when there is no layout block", () => {
    expect(combineInstructionWithLayout("Build a login screen", "")).toBe(
      "Build a login screen",
    );
  });

  it("concatenates instruction and layout block when the combination fits", () => {
    const layoutBlock = formatSketchLayoutForPrompt(layout);
    expect(combineInstructionWithLayout("Build a login screen", layoutBlock)).toBe(
      `Build a login screen\n\n${layoutBlock}`,
    );
  });

  it("keeps the full layout block and truncates the instruction when a long instruction would push the total over the cap", () => {
    const layoutBlock = formatSketchLayoutForPrompt(layout);
    const longInstruction = "x".repeat(3990);
    const result = combineInstructionWithLayout(longInstruction, layoutBlock, 4000);

    expect(result.length).toBeLessThanOrEqual(4000);
    expect(result.endsWith(layoutBlock)).toBe(true);
    expect(result).toContain(layoutBlock);
    // the instruction portion is what got truncated, not the layout block
    expect(result.startsWith("x".repeat(10))).toBe(true);
    expect(result.length).toBeLessThan(longInstruction.length + 2 + layoutBlock.length);
  });

  it("falls back to a plain cap when the layout block alone exceeds the max", () => {
    const hugeLayoutBlock = "L".repeat(4500);
    const result = combineInstructionWithLayout("short instruction", hugeLayoutBlock, 4000);
    expect(result.length).toBe(4000);
    expect(result).toBe(`short instruction\n\n${hugeLayoutBlock}`.slice(0, 4000));
  });

  it("is deterministic", () => {
    const layoutBlock = formatSketchLayoutForPrompt(layout);
    const longInstruction = "y".repeat(3990);
    expect(combineInstructionWithLayout(longInstruction, layoutBlock)).toBe(
      combineInstructionWithLayout(longInstruction, layoutBlock),
    );
  });
});
