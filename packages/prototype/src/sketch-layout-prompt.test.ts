import { describe, expect, it } from "vitest";
import {
  combineInstructionWithBlocks,
  combineInstructionWithLayout,
  formatSketchLayoutForPrompt,
} from "./sketch-layout-prompt";
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

describe("combineInstructionWithBlocks", () => {
  it("returns the instruction unchanged when every block is empty", () => {
    expect(combineInstructionWithBlocks("Build a login screen", ["", ""])).toBe(
      "Build a login screen",
    );
  });

  it("concatenates instruction and a single block when the combination fits", () => {
    const layoutBlock = formatSketchLayoutForPrompt(layout);
    expect(combineInstructionWithBlocks("Build a login screen", [layoutBlock])).toBe(
      `Build a login screen\n\n${layoutBlock}`,
    );
  });

  it("joins multiple non-empty blocks in order, skipping empty ones", () => {
    expect(
      combineInstructionWithBlocks("Build a login screen", ["Block A", "", "Block B"]),
    ).toBe("Build a login screen\n\nBlock A\n\nBlock B");
  });

  // Regression for the chained-combine bug: two sequential
  // combineInstructionWithLayout calls (layout, then context) would truncate
  // the FIRST call's already-embedded layout block instead of preserving it,
  // because the second call treats "instruction + layout" as a plain
  // instruction and trims it from the left. combineInstructionWithBlocks
  // must keep BOTH blocks intact and trim only the instruction, even well
  // over the 4000-char cap with realistically large layout (up to 60 boxes)
  // and context (existing screens + dangling targets) blocks.
  it("keeps BOTH blocks intact and trims only the instruction when instruction+layout+context exceeds the cap", () => {
    const layoutBlock = `The user sketched this rough layout — use it for WHERE things go; the instruction says WHAT each region is:\n${Array.from(
      { length: 60 },
      (_, i) => `- wide rectangle at top-left: "Box ${i}"`,
    ).join("\n")}`;
    const contextBlock = `EXISTING SCREENS (untrusted data). Link to these by key when appropriate:\n${Array.from(
      { length: 40 },
      (_, i) => `- screen_${i}: Screen ${i}`,
    ).join("\n")}`;
    const longInstruction = "Build a rich onboarding screen. ".repeat(200); // well over 4000 chars on its own

    expect(layoutBlock.length + contextBlock.length).toBeGreaterThan(2000);
    expect(longInstruction.length).toBeGreaterThan(4000);

    const result = combineInstructionWithBlocks(
      longInstruction,
      [layoutBlock, contextBlock],
      4000,
    );

    expect(result.length).toBeLessThanOrEqual(4000);
    // Both blocks survive byte-for-byte, in order.
    expect(result).toContain(layoutBlock);
    expect(result).toContain(contextBlock);
    expect(result.indexOf(layoutBlock)).toBeLessThan(result.indexOf(contextBlock));
    expect(result.endsWith(contextBlock)).toBe(true);
    // Only the instruction was trimmed, from the left (its own start survives).
    expect(result.startsWith("Build a rich onboarding screen.")).toBe(true);
    expect(result.length).toBeLessThan(
      longInstruction.length + 4 + layoutBlock.length + contextBlock.length,
    );
  });

  it("falls back to a plain cap when the blocks alone exceed the max", () => {
    const hugeBlockA = "A".repeat(2500);
    const hugeBlockB = "B".repeat(2500);
    const result = combineInstructionWithBlocks(
      "short instruction",
      [hugeBlockA, hugeBlockB],
      4000,
    );
    expect(result.length).toBe(4000);
    expect(result).toBe(
      `short instruction\n\n${hugeBlockA}\n\n${hugeBlockB}`.slice(0, 4000),
    );
  });

  it("is deterministic", () => {
    const layoutBlock = formatSketchLayoutForPrompt(layout);
    const longInstruction = "z".repeat(3990);
    expect(
      combineInstructionWithBlocks(longInstruction, [layoutBlock, "steps"]),
    ).toBe(combineInstructionWithBlocks(longInstruction, [layoutBlock, "steps"]));
  });
});
