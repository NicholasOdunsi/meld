import { describe, expect, it } from "vitest";
import { applicableControls, patchFor, readShapeStyle, shapePatch } from "./shape-style";

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

describe("which controls apply to which element", () => {
  const all = { panel: true, fill: true, stroke: true, thickness: true, style: true, corners: true, opacity: true };
  it("gives a rectangle everything", () => {
    expect(applicableControls("rectangle")).toEqual(all);
  });
  it("fills closed shapes only, and rounds rectangles only", () => {
    for (const type of ["ellipse", "diamond", "freedraw"]) expect(applicableControls(type)).toEqual({ ...all, corners: false });
    for (const type of ["line", "arrow"]) expect(applicableControls(type)).toEqual({ ...all, fill: false, corners: false });
  });
  it("gives text colour and opacity only", () => {
    expect(applicableControls("text")).toEqual({ panel: true, fill: false, stroke: true, thickness: false, style: false, corners: false, opacity: true });
  });
  it("shows no panel for frames, embeddables, iframes or images", () => {
    for (const type of ["frame", "magicframe", "embeddable", "iframe", "image"]) expect(applicableControls(type).panel).toBe(false);
  });
});

describe("patchFor keeps a patch to what the element can take", () => {
  const everything = shapePatch({ fill: "#ff0000", stroke: "#00ff00", strokeWidth: 3, strokeStyle: "dashed", rounded: true, opacity: 50 });
  it("gives a rectangle the whole patch, with its adaptive rounding", () => {
    expect(patchFor("rectangle", everything)).toEqual(everything);
    expect(patchFor("rectangle", everything).roundness).toEqual({ type: 3 });
  });
  it("never writes roundness or fill where they do nothing", () => {
    for (const type of ["ellipse", "diamond", "freedraw", "line", "arrow"]) expect(patchFor(type, everything)).not.toHaveProperty("roundness");
    expect(patchFor("ellipse", everything)).toMatchObject({ backgroundColor: "#ff0000", fillStyle: "solid" });
    expect(patchFor("arrow", everything)).not.toHaveProperty("backgroundColor");
    expect(patchFor("arrow", everything)).not.toHaveProperty("fillStyle");
    expect(patchFor("arrow", everything)).toMatchObject({ strokeColor: "#00ff00", strokeWidth: 3, strokeStyle: "dashed", opacity: 50 });
  });
  it("in a text and rectangle mix, text only takes colour and opacity", () => {
    expect(patchFor("text", everything)).toEqual({ strokeColor: "#00ff00", opacity: 50 });
    expect(patchFor("rectangle", everything)).toEqual(everything);
  });
  it("gives screens, frames and images nothing", () => {
    for (const type of ["embeddable", "iframe", "image", "frame", "magicframe"]) expect(patchFor(type, everything)).toEqual({});
  });
});
