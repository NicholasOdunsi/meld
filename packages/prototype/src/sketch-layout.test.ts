import { describe, expect, it } from "vitest";
import { serializeSketch, shapeCenterInFrame, SketchLayoutSchema, MAX_SKETCH_BOXES } from "./sketch-layout";

const frame = { x: 0, y: 0, w: 300, h: 900 }; // 3-wide buckets at 100; thirds at 300/600

// eslint-disable-next-line @typescript-eslint/no-explicit-any
function box(kind: any, x: number, y: number, w: number, h: number, text: string | null = null) {
  return { kind, x, y, w, h, text };
}

describe("serializeSketch", () => {
  it("buckets position by frame thirds", () => {
    const out = serializeSketch([box("rectangle", 0, 0, 30, 30, "a")], frame).boxes[0];
    expect(out.position).toEqual({ vertical: "top", horizontal: "left" });
    const mid = serializeSketch([box("rectangle", 135, 405, 30, 30)], frame).boxes[0]; // center 150,420 → x .5, y .47
    expect(mid.position).toEqual({ vertical: "middle", horizontal: "center" });
    const br = serializeSketch([box("rectangle", 270, 870, 30, 30)], frame).boxes[0]; // center .95,.97
    expect(br.position).toEqual({ vertical: "bottom", horizontal: "right" });
  });

  it("buckets size by fraction of frame", () => {
    expect(serializeSketch([box("rectangle", 0, 0, 30, 30)], frame).boxes[0].size)
      .toEqual({ width: "narrow", height: "short" });      // 0.1 w, 0.033 h
    expect(serializeSketch([box("rectangle", 0, 0, 300, 900)], frame).boxes[0].size)
      .toEqual({ width: "full", height: "tall" });
    expect(serializeSketch([box("rectangle", 0, 0, 150, 270)], frame).boxes[0].size)
      .toEqual({ width: "medium", height: "medium" });     // 0.5 w, 0.3 h
  });

  it("orders top-to-bottom then left-to-right, and reports text verbatim (trimmed)", () => {
    const out = serializeSketch([
      box("rectangle", 200, 500, 20, 20, "  second-row-right "),
      box("text", 0, 0, 20, 20, " first "),
      box("rectangle", 0, 500, 20, 20, "second-row-left"),
    ], frame);
    expect(out.boxes.map((b) => b.text)).toEqual(["first", "second-row-left", "second-row-right"]);
  });

  it("maps unknown kinds to 'other' and never throws on zero-size", () => {
    const out = serializeSketch([box("weird", 10, 10, 0, 0, null)], frame);
    expect(out.boxes[0].shapeKind).toBe("other");
  });

  it("caps boxes and flags truncation", () => {
    const many = Array.from({ length: MAX_SKETCH_BOXES + 5 }, (_, i) => box("rectangle", 0, i, 10, 10));
    const out = serializeSketch(many, frame);
    expect(out.boxes).toHaveLength(MAX_SKETCH_BOXES);
    expect(out.truncated).toBe(true);
  });

  it("is deterministic and schema-valid", () => {
    const shapes = [box("rectangle", 10, 10, 30, 40, "x")];
    expect(serializeSketch(shapes, frame)).toEqual(serializeSketch(shapes, frame));
    expect(() => SketchLayoutSchema.parse(serializeSketch(shapes, frame))).not.toThrow();
  });
});

describe("shapeCenterInFrame", () => {
  it("is true when the shape center is inside the frame", () => {
    expect(shapeCenterInFrame({ x: 10, y: 10, w: 20, h: 20 }, frame)).toBe(true);
    expect(shapeCenterInFrame({ x: 400, y: 10, w: 20, h: 20 }, frame)).toBe(false);
  });
});
