import { describe, expect, it } from "vitest";
import { composeInstruction } from "./compose-instruction";
import type { PickedInspiration } from "./pick-inspiration";

const pick = (n: number, origin: "room" | "library" = "library"): PickedInspiration => ({
  itemId: `00000000-0000-4000-8000-00000000000${n}`,
  addedAt: "2026-11-07T00:00:00.000Z",
  origin,
  labels: {
    device: "mobile",
    screenType: "login",
    patterns: ["form"],
    theme: "light",
    colors: ["#ffffff"],
    styleWords: ["minimal"],
    description: "d".repeat(200),
  },
});

describe("composeInstruction", () => {
  it("joins base, taste and inspiration in that order", () => {
    const out = composeInstruction({ base: "make a login", tasteBlock: "YOUR TASTE x", inspiration: [pick(1)] });
    expect(out.indexOf("make a login")).toBe(0);
    expect(out.indexOf("YOUR TASTE")).toBeLessThan(out.indexOf("INSPIRATION"));
    expect(out).toContain("[library]");
  });

  it("drops inspiration lines before the taste block, and never trims the base", () => {
    const base = "b".repeat(3000);
    const taste = "YOUR TASTE " + "t".repeat(500);
    const out = composeInstruction({ base, tasteBlock: taste, inspiration: [pick(1), pick(2), pick(3)] });
    expect(out.startsWith(base)).toBe(true);
    expect(out).toContain(taste);
    expect(out.length).toBeLessThanOrEqual(4000);
    expect(composeInstruction({ base: "b".repeat(3900), tasteBlock: taste, inspiration: [pick(1)] })).toBe("b".repeat(3900));
  });

  it("uses the clash-aware header only when a taste block is present", () => {
    expect(composeInstruction({ base: "x", tasteBlock: "YOUR TASTE y", inspiration: [pick(1, "room")] })).toMatch(
      /\[library\] images: where their look clashes with YOUR TASTE/,
    );
    expect(composeInstruction({ base: "x", tasteBlock: "", inspiration: [pick(1, "room")] })).not.toMatch(/clashes/);
  });

  it("puts the Apple block after taste and before inspiration", () => {
    const out = composeInstruction({
      base: "make a login",
      tasteBlock: "YOUR TASTE x",
      appleBlock: "APPLE RULES y",
      inspiration: [pick(1)],
    });
    expect(out.indexOf("YOUR TASTE")).toBeLessThan(out.indexOf("APPLE RULES"));
    expect(out.indexOf("APPLE RULES")).toBeLessThan(out.indexOf("INSPIRATION"));
  });

  it("drops inspiration, then the Apple block, then taste, never the base", () => {
    const base = "b".repeat(3000);
    const taste = "YOUR TASTE " + "t".repeat(500);
    const apple = "APPLE RULES " + "a".repeat(400);
    const withInspiration = composeInstruction({ base, tasteBlock: taste, appleBlock: apple, inspiration: [pick(1)] });
    expect(withInspiration).toContain(apple);
    const noRoomForApple = composeInstruction({ base: "b".repeat(3400), tasteBlock: taste, appleBlock: apple, inspiration: [pick(1)] });
    expect(noRoomForApple).toContain(taste);
    expect(noRoomForApple).not.toContain("APPLE RULES");
    expect(noRoomForApple.length).toBeLessThanOrEqual(4000);
    expect(composeInstruction({ base: "b".repeat(3900), tasteBlock: taste, appleBlock: apple, inspiration: [] })).toBe("b".repeat(3900));
  });

  it("behaves as before when no Apple block is passed", () => {
    expect(composeInstruction({ base: "x", tasteBlock: "", inspiration: [] })).toBe("x");
  });
});
