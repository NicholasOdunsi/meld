// format-apple-rules-block.test.ts
import { describe, expect, it } from "vitest";
import type { TasteBoard } from "@meld/contracts";
import { APPLE_BLOCK_MAX_CHARS, formatAppleRulesBlock, isAppleTarget } from "./format-apple-rules-block";

const BOARD: TasteBoard = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "regular", tracking: "normal", note: "" },
  spacing: "generous",
  density: "airy",
  layoutHabits: [],
  signatureDetails: [],
  avoid: [],
};

describe("isAppleTarget", () => {
  it("is true for mobile, tablet and desktop apps", () => {
    expect(isAppleTarget("mobile", "a login screen")).toBe(true);
    expect(isAppleTarget("tablet", "a login screen")).toBe(true);
    expect(isAppleTarget("desktop_app", "a mac app settings screen")).toBe(true);
  });
  it("is false for web, unknown devices and explicit non-Apple wording", () => {
    expect(isAppleTarget("web", "a landing page")).toBe(false);
    expect(isAppleTarget(null, "a login screen")).toBe(false);
    expect(isAppleTarget("mobile", "an Android login with Material design")).toBe(false);
    expect(isAppleTarget("desktop_app", "a Windows app")).toBe(false);
  });
});

describe("formatAppleRulesBlock", () => {
  it("returns the rules for an Apple target when the switch is on", () => {
    const block = formatAppleRulesBlock({ enabled: true, appleTarget: true, board: BOARD });
    expect(block.startsWith("APPLE RULES")).toBe(true);
    expect(block).toContain("tap targets at least 44pt");
    expect(block).toContain("taste wins on look");
    expect(block).toContain("room design system wins brand colour and fonts");
    expect(block.length).toBeLessThanOrEqual(APPLE_BLOCK_MAX_CHARS);
  });
  it("is empty when the switch is off or the target is not Apple", () => {
    expect(formatAppleRulesBlock({ enabled: false, appleTarget: true, board: BOARD })).toBe("");
    expect(formatAppleRulesBlock({ enabled: true, appleTarget: false, board: BOARD })).toBe("");
  });
  it("tells the AI to use Regular when taste asks for Light, and stays under the cap", () => {
    const light = { ...BOARD, typography: { ...BOARD.typography, weight: "light" as const } };
    const block = formatAppleRulesBlock({ enabled: true, appleTarget: true, board: light });
    expect(block).toContain("use Regular, not Light");
    expect(block.length).toBeLessThanOrEqual(APPLE_BLOCK_MAX_CHARS);
  });
  it("works with no taste board", () => {
    expect(formatAppleRulesBlock({ enabled: true, appleTarget: true, board: null })).toContain("APPLE RULES");
  });
});
