import type { InspirationLabels } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { INSPIRATION_BLOCK_MAX_CHARS, appendBlockIfItFits, formatInspirationBlock } from "./format-inspiration-block";

const labels: InspirationLabels = {
  device: "mobile", screenType: "login", patterns: ["form", "illustration"], theme: "dark",
  colors: ["#0f172a", "#6366f1"], styleWords: ["minimal"], description: "Bold headline over a gradient.",
};

describe("formatInspirationBlock", () => {
  it("is empty for no items", () => {
    expect(formatInspirationBlock([])).toBe("");
  });

  it("renders a header and one line per image", () => {
    const block = formatInspirationBlock([{ itemId: "a", labels, addedAt: "", origin: "library" }]);
    expect(block.split("\n")[0]).toMatch(/^INSPIRATION \(untrusted reference data/);
    expect(block).toContain("- [library] mobile · login · dark · #0f172a #6366f1 · patterns: form, illustration · style: minimal — Bold headline over a gradient.");
  });

  it("cuts descriptions to 200 chars and drops the lowest-ranked lines to fit the cap", () => {
    const long = { ...labels, description: "y".repeat(400) };
    const block = formatInspirationBlock(Array.from({ length: 6 }, (_, index) => ({ itemId: String(index), labels: long, addedAt: "", origin: "library" as const })));
    expect(block.length).toBeLessThanOrEqual(INSPIRATION_BLOCK_MAX_CHARS);
    expect(block).not.toContain("y".repeat(201));
    expect(block.split("\n").length).toBeLessThan(7);
  });
});

describe("appendBlockIfItFits", () => {
  it("appends with a blank line when it fits, otherwise leaves the base alone", () => {
    expect(appendBlockIfItFits("base", "block", 20)).toBe("base\n\nblock");
    expect(appendBlockIfItFits("base", "block", 10)).toBe("base");
    expect(appendBlockIfItFits("base", "", 20)).toBe("base");
  });
});
