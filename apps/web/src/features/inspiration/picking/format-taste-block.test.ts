import type { TasteBoard } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { formatTasteBlock, TASTE_BLOCK_MAX_CHARS } from "./format-taste-block";

const BOARD: TasteBoard = {
  designLanguage: ["minimal", "bold-type"],
  colors: [
    { hex: "#ffffff", role: "base" },
    { hex: "#111111", role: "action" },
  ],
  typography: { weight: "heavy", tracking: "tight", note: "Heavy headlines" },
  spacing: "generous",
  density: "airy",
  layoutHabits: ["Centred single-column forms"],
  signatureDetails: ["Full-width black primary button"],
  avoid: [{ text: "gradients", source: "typed" }],
};

describe("formatTasteBlock", () => {
  it("returns nothing without a board", () => {
    expect(formatTasteBlock(null)).toBe("");
  });

  it("lists every tile with avoid last", () => {
    const block = formatTasteBlock(BOARD);
    expect(block.split("\n")).toEqual([
      "YOUR TASTE (the owner's approved preferences; a room design system wins on brand colours and fonts):",
      "- design language: minimal, bold-type",
      "- type: heavy weight, tight tracking — Heavy headlines",
      "- spacing: generous · density: airy",
      "- shape: soft corners, shadows",
      "- motion: snappy",
      "- voice: plain",
      "- layout habits: Centred single-column forms",
      "- signature details: Full-width black primary button",
      "- avoid: gradients",
    ]);
  });

  it("has no colour line and states motion, shape and voice", () => {
    const block = formatTasteBlock({ ...BOARD, motion: "smooth", shape: { corners: "round", depth: "hairlines" }, voice: { tone: "warm", note: "friendly" } });
    expect(block).not.toContain("- colours:");
    expect(block).toContain("- shape: round corners, hairlines");
    expect(block).toContain("- motion: smooth");
    expect(block).toContain("- voice: warm — friendly");
  });

  it("falls back to the defaults for an old board", () => {
    const block = formatTasteBlock(BOARD);
    expect(block).toContain("- motion: snappy");
    expect(block).toContain("- shape: soft corners, shadows");
    expect(block).toContain("- voice: plain");
  });

  it("drops lines from the bottom but keeps avoid until last", () => {
    const long = {
      ...BOARD,
      layoutHabits: Array(5).fill("x".repeat(80)),
      signatureDetails: Array(6).fill("y".repeat(60)),
    };
    const block = formatTasteBlock(long);
    expect(block.length).toBeLessThanOrEqual(TASTE_BLOCK_MAX_CHARS);
    expect(block).toContain("- avoid: gradients");
    expect(block).not.toContain("signature details");
  });
});
