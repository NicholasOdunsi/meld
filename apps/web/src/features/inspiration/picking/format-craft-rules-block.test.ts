import { describe, expect, it } from "vitest";
import { CRAFT_BLOCK_MAX_CHARS, formatCraftRulesBlock } from "./format-craft-rules-block";

describe("formatCraftRulesBlock", () => {
  it("always lists all eight rules, even with no board", () => {
    const block = formatCraftRulesBlock(null);
    expect(block.startsWith("CRAFT RULES")).toBe(true);
    for (const fragment of ["0.96", "exit", "constant", "Reduce Motion", "tabular", "outer radius = inner radius + padding", "44px", "calm, plain"]) {
      expect(block).toContain(fragment);
    }
    expect(block.length).toBeLessThanOrEqual(CRAFT_BLOCK_MAX_CHARS);
  });

  it("states the chosen motion in exact numbers", () => {
    const board = { motion: "smooth" } as never;
    expect(formatCraftRulesBlock(board)).toContain("300ms");
    expect(formatCraftRulesBlock({ motion: "playful" } as never)).toContain("450ms");
    expect(formatCraftRulesBlock({ motion: "instant" } as never)).toContain("no movement");
    expect(formatCraftRulesBlock(null)).toContain("150ms");
  });
});
