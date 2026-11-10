import type { TasteBoard } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { describeSuggestion } from "./describe-suggestion";

const BOARD = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "heavy", tracking: "tight", note: "" },
  spacing: "generous",
  density: "airy",
  layoutHabits: [],
  signatureDetails: [],
  avoid: [],
} satisfies TasteBoard;

describe("describeSuggestion", () => {
  it("words each operation in Meld's own voice", () => {
    expect(describeSuggestion({ tile: "density", op: "set", value: "balanced" }, BOARD)).toBe("Density: airy → balanced");
    expect(describeSuggestion({ tile: "colors", op: "add", value: { hex: "#ff6b57", role: "accent" } }, BOARD)).toBe(
      "Add #ff6b57 (accent) to Colour",
    );
    expect(describeSuggestion({ tile: "designLanguage", op: "remove", value: "minimal" }, BOARD)).toBe(
      "Remove “minimal” from Design language",
    );
    expect(describeSuggestion({ tile: "avoid", op: "add", value: { text: "gradients", source: "redo" } }, BOARD)).toBe(
      "You seem to avoid “gradients”",
    );
  });

  it("describes the new tiles", () => {
    expect(describeSuggestion({ tile: "motion", op: "set", value: "smooth" }, BOARD)).toBe("Motion: snappy → smooth");
    expect(describeSuggestion({ tile: "shape", op: "set", value: { corners: "round", depth: "flat" } }, BOARD)).toBe("Shape: soft, shadows → round, flat");
    expect(describeSuggestion({ tile: "voice", op: "set", value: { tone: "warm", note: "" } }, BOARD)).toBe("Voice: plain → warm");
  });
});
