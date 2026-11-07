import type { TasteBoard, TasteSuggestion } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import { filterSuggestions } from "./filter-suggestions";

const OWN = "00000000-0000-4000-8000-000000000001";
const FOREIGN = "00000000-0000-4000-8000-000000000099";
const BOARD: TasteBoard = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "heavy", tracking: "tight", note: "" },
  spacing: "generous",
  density: "airy",
  layoutHabits: [],
  signatureDetails: [],
  avoid: [],
};
const ctx = (over = {}) => ({
  board: BOARD,
  locks: {},
  sortedCount: 20,
  rejectedKeys: new Set<string>(),
  ownItemIds: new Set([OWN]),
  ...over,
});
const s = (over: Partial<TasteSuggestion> & Pick<TasteSuggestion, "tile" | "op" | "value">): TasteSuggestion =>
  ({ reason: "r", evidenceItemIds: [OWN], ...over }) as TasteSuggestion;

describe("filterSuggestions", () => {
  it("keeps a valid suggestion and attaches its value key", () => {
    const out = filterSuggestions([s({ tile: "density", op: "set", value: "balanced" })], ctx());
    expect(out).toEqual([expect.objectContaining({ valueKey: "density:set:balanced" })]);
  });

  it("drops no-ops, rejected ones, duplicates and foreign evidence", () => {
    const out = filterSuggestions(
      [
        s({ tile: "density", op: "set", value: "airy" }),
        s({ tile: "designLanguage", op: "add", value: "airy" }),
        s({ tile: "designLanguage", op: "add", value: "Airy " }),
        s({ tile: "spacing", op: "set", value: "tight", evidenceItemIds: [FOREIGN] }),
        s({ tile: "signatureDetails", op: "add", value: "pill buttons" }),
      ],
      ctx({ rejectedKeys: new Set(["signatureDetails:add:pill buttons"]) }),
    );
    expect(out.map((x) => x.valueKey)).toEqual(["designLanguage:add:airy"]);
  });

  it("respects tile locks until 5 more images are sorted", () => {
    const one = [s({ tile: "density", op: "set", value: "balanced" })];
    expect(filterSuggestions(one, ctx({ locks: { density: 18 } }))).toEqual([]);
    expect(filterSuggestions(one, ctx({ locks: { density: 15 } }))).toHaveLength(1);
  });

  it("caps the output at 5", () => {
    const many = ["a", "b", "c", "d", "e", "f"].map((w) =>
      s({ tile: "layoutHabits", op: "add", value: `habit ${w}` }),
    );
    expect(filterSuggestions(many, ctx({ board: { ...BOARD, layoutHabits: [] } }))).toHaveLength(5);
  });
});
