import { describe, expect, it } from "vitest";
import type { TasteBoard } from "@meld/contracts";
import { appleTasteCards } from "./apple-preset";

const BOARD: TasteBoard = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "light", tracking: "tight", note: "" },
  spacing: "tight",
  density: "dense",
  layoutHabits: [],
  signatureDetails: [],
  avoid: [],
};

describe("appleTasteCards", () => {
  it("proposes regular type, generous spacing, balanced density and a top-leading habit", () => {
    const cards = appleTasteCards(BOARD, []);
    const keys = cards.map((c) => `${c.tile}:${c.op}`);
    expect(keys).toEqual(expect.arrayContaining(["typography:set", "spacing:set", "density:set", "layoutHabits:add"]));
    const type = cards.find((c) => c.tile === "typography");
    expect(type?.value).toMatchObject({ weight: "regular" });
    expect(cards.every((c) => c.source.kind === "preset" && c.source.name === "Apple Human Interface Guidelines")).toBe(true);
  });
  it("skips what the board already has and what was rejected", () => {
    const already: TasteBoard = { ...BOARD, typography: { weight: "regular", tracking: "normal", note: "" }, spacing: "generous", density: "balanced", layoutHabits: ["Most important content at the top and leading edge"] };
    expect(appleTasteCards(already, [])).toEqual([]);
    expect(appleTasteCards(BOARD, ["spacing:set:generous"]).some((c) => c.tile === "spacing")).toBe(false);
  });
});
