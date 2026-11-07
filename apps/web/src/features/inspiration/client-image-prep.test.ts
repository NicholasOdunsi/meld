import { describe, expect, it } from "vitest";
import { planImagePrep } from "./client-image-prep";

const small = { size: 1000, width: 800, height: 600 };

describe("planImagePrep", () => {
  it("passes stored formats through when within limits", () => {
    for (const type of ["image/png", "image/jpeg", "image/webp"]) {
      expect(planImagePrep({ type, ...small })).toEqual({ kind: "pass" });
    }
  });

  it("turns a GIF into a PNG still and other images into PNG", () => {
    expect(planImagePrep({ type: "image/gif", ...small })).toEqual({ kind: "encode", type: "image/png", maxEdge: null });
    expect(planImagePrep({ type: "image/bmp", ...small })).toEqual({ kind: "encode", type: "image/png", maxEdge: null });
  });

  it("shrinks long or heavy images to a JPEG at the max edge", () => {
    expect(planImagePrep({ type: "image/png", size: 1000, width: 5000, height: 10 })).toEqual({
      kind: "encode",
      type: "image/jpeg",
      maxEdge: 4096,
    });
    expect(planImagePrep({ type: "image/jpeg", size: 20_000_000, width: 3000, height: 3000 })).toEqual({
      kind: "encode",
      type: "image/jpeg",
      maxEdge: 4096,
    });
  });

  it("sends HEIC to the shelf and rejects non-images", () => {
    expect(planImagePrep({ type: "image/heic", ...small })).toEqual({
      kind: "reject",
      message: "Drop HEIC photos on the menu-bar shelf instead.",
    });
    expect(planImagePrep({ type: "application/pdf", ...small })).toEqual({ kind: "reject", message: "Only images can be saved." });
  });
});
