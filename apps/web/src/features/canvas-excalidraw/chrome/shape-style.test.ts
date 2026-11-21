import { describe, expect, it } from "vitest";
import { readShapeStyle, shapePatch } from "./shape-style";

describe("shape style mapping", () => {
  it("reads Excalidraw props into panel terms", () => {
    expect(readShapeStyle({ backgroundColor: "transparent", strokeColor: "#1e1e1e", strokeWidth: 2, strokeStyle: "dashed", roundness: { type: 3 }, opacity: 80 }))
      .toEqual({ fill: null, stroke: "#1e1e1e", strokeWidth: 2, strokeStyle: "dashed", rounded: true, opacity: 80 });
  });
  it("reads a filled, sharp-cornered shape", () => {
    expect(readShapeStyle({ backgroundColor: "#ff0000", strokeColor: "#000000", strokeWidth: 1, strokeStyle: "solid", roundness: null, opacity: 100 }))
      .toMatchObject({ fill: "#ff0000", rounded: false, strokeStyle: "solid" });
  });
  it("turning fill on makes it solid, off makes it transparent", () => {
    expect(shapePatch({ fill: "#ff0000" })).toEqual({ backgroundColor: "#ff0000", fillStyle: "solid" });
    expect(shapePatch({ fill: null })).toEqual({ backgroundColor: "transparent" });
  });
  it("maps the remaining fields and clamps", () => {
    expect(shapePatch({ stroke: "#000000", strokeStyle: "dotted", rounded: false, strokeWidth: 12, opacity: 140 }))
      .toEqual({ strokeColor: "#000000", strokeStyle: "dotted", roundness: null, strokeWidth: 8, opacity: 100 });
    expect(shapePatch({ rounded: true })).toEqual({ roundness: { type: 3 } });
    expect(shapePatch({ strokeWidth: 0, opacity: -5 })).toEqual({ strokeWidth: 1, opacity: 0 });
  });
});
