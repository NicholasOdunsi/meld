import { describe, expect, it } from "vitest";
import {
  applyTasteOperation,
  ShelfAppleRulesRequestSchema,
  ShelfTasteDecisionRequestSchema,
  ShelfTasteSnapshotSchema,
  ShelfTasteTileRequestSchema,
  TasteBoardSchema,
  TasteSuggestionsResponseSchema,
  tasteValueKey,
  type TasteBoard,
} from "./taste";

const BOARD: TasteBoard = {
  designLanguage: ["minimal", "bold-type"],
  colors: [
    { hex: "#ffffff", role: "base" },
    { hex: "#111111", role: "action" },
  ],
  typography: { weight: "heavy", tracking: "tight", note: "Heavy, tight headlines" },
  spacing: "generous",
  density: "airy",
  layoutHabits: ["Centred single-column forms"],
  signatureDetails: ["Full-width black primary button"],
  avoid: [],
};

describe("TasteBoardSchema", () => {
  it("accepts a valid board and normalises text", () => {
    const parsed = TasteBoardSchema.parse({
      ...BOARD,
      designLanguage: ["  Minimal "],
      layoutHabits: ["Split  screens\non web"],
    });
    expect(parsed.designLanguage).toEqual(["minimal"]);
    expect(parsed.layoutHabits).toEqual(["Split screens on web"]);
  });

  it("enforces tile limits and unique colours", () => {
    expect(TasteBoardSchema.safeParse({ ...BOARD, designLanguage: [] }).success).toBe(false);
    expect(
      TasteBoardSchema.safeParse({ ...BOARD, colors: [BOARD.colors[0], BOARD.colors[0]] }).success,
    ).toBe(false);
    expect(TasteBoardSchema.safeParse({ ...BOARD, density: "roomy" }).success).toBe(false);
    expect(
      TasteBoardSchema.safeParse({ ...BOARD, signatureDetails: Array(7).fill("x") }).success,
    ).toBe(false);
  });
});

describe("applyTasteOperation", () => {
  it("adds, removes and sets", () => {
    expect(
      applyTasteOperation(BOARD, { tile: "designLanguage", op: "add", value: "airy" })
        ?.designLanguage,
    ).toEqual(["minimal", "bold-type", "airy"]);
    expect(
      applyTasteOperation(BOARD, { tile: "designLanguage", op: "remove", value: "Minimal" })
        ?.designLanguage,
    ).toEqual(["bold-type"]);
    expect(applyTasteOperation(BOARD, { tile: "density", op: "set", value: "balanced" })?.density).toBe(
      "balanced",
    );
  });

  it("returns null for no-ops, missing items, overflow and duplicate hex", () => {
    expect(applyTasteOperation(BOARD, { tile: "density", op: "set", value: "airy" })).toBeNull();
    expect(applyTasteOperation(BOARD, { tile: "designLanguage", op: "add", value: "MINIMAL" })).toBeNull();
    expect(applyTasteOperation(BOARD, { tile: "layoutHabits", op: "remove", value: "nope" })).toBeNull();
    expect(
      applyTasteOperation(BOARD, { tile: "colors", op: "add", value: { hex: "#FFFFFF", role: "accent" } }),
    ).toBeNull();
    const full = { ...BOARD, designLanguage: ["a", "b", "c", "d"] };
    expect(applyTasteOperation(full, { tile: "designLanguage", op: "add", value: "e" })).toBeNull();
  });
});

describe("tasteValueKey", () => {
  it("normalises case, spacing and colour roles", () => {
    expect(tasteValueKey({ tile: "signatureDetails", op: "add", value: " Pill  Buttons " })).toBe(
      "signatureDetails:add:pill buttons",
    );
    expect(tasteValueKey({ tile: "colors", op: "add", value: { hex: "#E2231A", role: "accent" } })).toBe(
      "colors:add:#e2231a",
    );
    expect(tasteValueKey({ tile: "avoid", op: "add", value: { text: "Gradients", source: "redo" } })).toBe(
      "avoid:add:gradients",
    );
  });
});

describe("TasteSuggestionsResponseSchema", () => {
  it("rejects a set on a list tile and more than 5 suggestions", () => {
    const bad = {
      suggestions: [{ tile: "colors", op: "set", value: [], reason: "x", evidenceItemIds: [] }],
    };
    expect(TasteSuggestionsResponseSchema.safeParse(bad).success).toBe(false);
    const one = {
      tile: "density",
      op: "set",
      value: "balanced",
      reason: "Denser dashboards",
      evidenceItemIds: [],
    };
    expect(TasteSuggestionsResponseSchema.safeParse({ suggestions: Array(6).fill(one) }).success).toBe(false);
    expect(TasteSuggestionsResponseSchema.safeParse({ suggestions: [one] }).success).toBe(true);
  });
});

describe("Shelf taste contracts", () => {
  it("accepts a snapshot and a tile save", () => {
    expect(
      ShelfTasteSnapshotSchema.safeParse({ board: BOARD, version: 2, appleRules: true, pending: [] }).success,
    ).toBe(true);
    expect(ShelfTasteTileRequestSchema.safeParse({ tile: "density", value: "airy", expectedVersion: 2 }).success).toBe(true);
  });
  it("rejects unknown tiles, bad decisions and extra keys", () => {
    expect(ShelfTasteTileRequestSchema.safeParse({ tile: "mood", value: 1, expectedVersion: 0 }).success).toBe(false);
    expect(ShelfTasteDecisionRequestSchema.safeParse({ decision: "maybe", expectedVersion: 0 }).success).toBe(false);
    expect(ShelfAppleRulesRequestSchema.safeParse({ enabled: true, extra: 1 }).success).toBe(false);
  });
});
