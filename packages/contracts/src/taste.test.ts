import { describe, expect, it } from "vitest";
import {
  applyTasteOperation,
  resolveTasteBoard,
  ShelfTasteDecisionRequestSchema,
  ShelfTasteSnapshotSchema,
  ShelfTasteTileRequestSchema,
  TasteBoardSchema,
  TasteComposerCardSchema,
  TasteOperationSchema,
  TasteSuggestionsResponseSchema,
  TASTE_TILES,
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
      ShelfTasteSnapshotSchema.safeParse({ board: BOARD, version: 2, pending: [] }).success,
    ).toBe(true);
    expect(ShelfTasteTileRequestSchema.safeParse({ tile: "density", value: "airy", expectedVersion: 2 }).success).toBe(true);
  });
  it("has no Apple switch in the snapshot", () => {
    const parsed = ShelfTasteSnapshotSchema.safeParse({ board: BOARD, version: 2, pending: [] });
    expect(parsed.success).toBe(true);
    expect(parsed.success && "appleRules" in parsed.data).toBe(false);
    const withOld = ShelfTasteSnapshotSchema.safeParse({ board: BOARD, version: 2, appleRules: true, pending: [] });
    expect(withOld.success && "appleRules" in withOld.data).toBe(false);
  });
  it("rejects unknown tiles, bad decisions and extra keys", () => {
    expect(ShelfTasteTileRequestSchema.safeParse({ tile: "mood", value: 1, expectedVersion: 0 }).success).toBe(false);
    expect(ShelfTasteDecisionRequestSchema.safeParse({ decision: "maybe", expectedVersion: 0 }).success).toBe(false);
  });
});

describe("motion, shape and voice", () => {
  it("accepts an old board without them and a new board with them", () => {
    expect(TasteBoardSchema.safeParse(BOARD).success).toBe(true);
    const full = {
      ...BOARD,
      motion: "smooth",
      shape: { corners: "round", depth: "hairlines" },
      voice: { tone: "warm", note: "friendly" },
    };
    expect(TasteBoardSchema.safeParse(full).success).toBe(true);
  });

  it("rejects values outside the vocabulary", () => {
    expect(TasteBoardSchema.safeParse({ ...BOARD, motion: "zippy" }).success).toBe(false);
    expect(TasteBoardSchema.safeParse({ ...BOARD, shape: { corners: "pointy", depth: "flat" } }).success).toBe(false);
    expect(TasteBoardSchema.safeParse({ ...BOARD, voice: { tone: "rude", note: "" } }).success).toBe(false);
    expect(TasteBoardSchema.safeParse({ ...BOARD, voice: { tone: "plain", note: "x".repeat(81) } }).success).toBe(false);
  });

  it("fills the defaults when resolving a bare board", () => {
    const resolved = resolveTasteBoard(TasteBoardSchema.parse(BOARD));
    expect(resolved.motion).toBe("snappy");
    expect(resolved.shape).toEqual({ corners: "soft", depth: "shadows" });
    expect(resolved.voice).toEqual({ tone: "plain", note: "" });
  });

  it("names 11 tiles including the new ones", () => {
    expect(TASTE_TILES).toHaveLength(11);
    expect(TASTE_TILES).toEqual(expect.arrayContaining(["motion", "shape", "voice"]));
  });

  it("allows set on the new tiles and nothing else", () => {
    expect(TasteOperationSchema.safeParse({ tile: "motion", op: "set", value: "smooth" }).success).toBe(true);
    expect(TasteOperationSchema.safeParse({ tile: "motion", op: "add", value: "smooth" }).success).toBe(false);
    expect(TasteOperationSchema.safeParse({ tile: "shape", op: "set", value: { corners: "round", depth: "flat" } }).success).toBe(true);
    expect(TasteOperationSchema.safeParse({ tile: "voice", op: "set", value: { tone: "warm", note: "" } }).success).toBe(true);
    expect(TasteOperationSchema.safeParse({ tile: "voice", op: "remove", value: { tone: "warm", note: "" } }).success).toBe(false);
  });

  it("gives them stable value keys", () => {
    expect(tasteValueKey({ tile: "motion", op: "set", value: "smooth" })).toBe("motion:set:smooth");
    expect(tasteValueKey({ tile: "shape", op: "set", value: { corners: "round", depth: "flat" } })).toBe("shape:set:round/flat");
    expect(tasteValueKey({ tile: "voice", op: "set", value: { tone: "warm", note: "Hi  there" } })).toBe("voice:set:warm/hi there");
  });

  it("treats setting the default on a bare board as a no-op, and a real change as a change", () => {
    const board = TasteBoardSchema.parse(BOARD);
    expect(applyTasteOperation(board, { tile: "motion", op: "set", value: "snappy" })).toBeNull();
    expect(applyTasteOperation(board, { tile: "motion", op: "set", value: "smooth" })?.motion).toBe("smooth");
    expect(applyTasteOperation(board, { tile: "shape", op: "set", value: { corners: "round", depth: "flat" } })?.shape).toEqual({
      corners: "round",
      depth: "flat",
    });
  });
});

describe("TasteComposerCardSchema", () => {
  it("accepts an operation with a reason and a source", () => {
    expect(
      TasteComposerCardSchema.safeParse({
        tile: "density",
        op: "set",
        value: "airy",
        reason: "Brand guide says generous whitespace",
        source: { kind: "file", name: "Brand.pdf", locator: "page 6" },
      }).success,
    ).toBe(true);
  });
  it("rejects an unknown source kind or an invalid value", () => {
    expect(
      TasteComposerCardSchema.safeParse({
        tile: "density",
        op: "set",
        value: "roomy",
        reason: "r",
        source: { kind: "file", name: "a", locator: "" },
      }).success,
    ).toBe(false);
    expect(
      TasteComposerCardSchema.safeParse({
        tile: "density",
        op: "set",
        value: "airy",
        reason: "r",
        source: { kind: "dream", name: "a", locator: "" },
      }).success,
    ).toBe(false);
  });
});
