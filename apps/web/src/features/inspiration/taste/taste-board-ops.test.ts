import { describe, expect, it } from "vitest";
import type { TasteBoard } from "@meld/contracts";
import { withRejectedAvoid } from "./taste-board-ops";

const BOARD: TasteBoard = {
  designLanguage: ["minimal"],
  colors: [{ hex: "#ffffff", role: "base" }],
  typography: { weight: "regular", tracking: "normal", note: "" },
  spacing: "generous",
  density: "airy",
  layoutHabits: [],
  signatureDetails: ["Pill buttons"],
  avoid: [],
};

describe("withRejectedAvoid", () => {
  it("records a rejected addition as a dislike", () => {
    const next = withRejectedAvoid(BOARD, { tile: "signatureDetails", op: "add", value: "Heavy shadows" });
    expect(next.avoid).toEqual([{ text: "Heavy shadows", source: "rejected" }]);
  });
  it("leaves the board alone for sets, removes and avoid additions", () => {
    expect(withRejectedAvoid(BOARD, { tile: "density", op: "set", value: "dense" })).toBe(BOARD);
    expect(withRejectedAvoid(BOARD, { tile: "signatureDetails", op: "remove", value: "Pill buttons" })).toBe(BOARD);
    expect(withRejectedAvoid(BOARD, { tile: "avoid", op: "add", value: { text: "x", source: "typed" } })).toBe(BOARD);
  });
});
