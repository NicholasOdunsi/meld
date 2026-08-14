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

  it("pins width bucket boundaries at 0.33, 0.66, 0.95", () => {
    // w=99: 99/300=0.33 (NOT <0.33) → medium; w=98: 0.3267 (<0.33) → narrow
    expect(serializeSketch([box("rectangle", 0, 0, 99, 20)], frame).boxes[0].size.width).toBe("medium");
    expect(serializeSketch([box("rectangle", 0, 0, 98, 20)], frame).boxes[0].size.width).toBe("narrow");
    // w=198: 198/300=0.66 (NOT <0.66) → wide; w=197: 0.6567 (<0.66) → medium
    expect(serializeSketch([box("rectangle", 0, 0, 198, 20)], frame).boxes[0].size.width).toBe("wide");
    expect(serializeSketch([box("rectangle", 0, 0, 197, 20)], frame).boxes[0].size.width).toBe("medium");
    // w=285: 285/300=0.95 (NOT <0.95) → full; w=284: 0.9467 (<0.95) → wide
    expect(serializeSketch([box("rectangle", 0, 0, 285, 20)], frame).boxes[0].size.width).toBe("full");
    expect(serializeSketch([box("rectangle", 0, 0, 284, 20)], frame).boxes[0].size.width).toBe("wide");
  });

  it("pins height bucket boundaries at 0.2, 0.5", () => {
    // h=180: 180/900=0.2 (NOT <0.2) → medium; h=179: 0.1989 (<0.2) → short
    expect(serializeSketch([box("rectangle", 0, 0, 20, 180)], frame).boxes[0].size.height).toBe("medium");
    expect(serializeSketch([box("rectangle", 0, 0, 20, 179)], frame).boxes[0].size.height).toBe("short");
    // h=450: 450/900=0.5 (NOT <0.5) → tall; h=449: 0.4989 (<0.5) → medium
    expect(serializeSketch([box("rectangle", 0, 0, 20, 450)], frame).boxes[0].size.height).toBe("tall");
    expect(serializeSketch([box("rectangle", 0, 0, 20, 449)], frame).boxes[0].size.height).toBe("medium");
  });

  it("pins vertical position boundaries at 1/3 and 2/3", () => {
    // center_y=300: 300/900=1/3 (NOT <1/3) → middle; center_y=299 (<1/3) → top
    // To get center_y=300 with h=20: y=290; to get center_y=299: y=289
    expect(serializeSketch([box("rectangle", 0, 290, 20, 20)], frame).boxes[0].position.vertical).toBe("middle");
    expect(serializeSketch([box("rectangle", 0, 289, 20, 20)], frame).boxes[0].position.vertical).toBe("top");
    // center_y=600: 600/900=2/3 (NOT <2/3) → bottom; center_y=599 (<2/3) → middle
    // To get center_y=600 with h=20: y=590; to get center_y=599: y=589
    expect(serializeSketch([box("rectangle", 0, 590, 20, 20)], frame).boxes[0].position.vertical).toBe("bottom");
    expect(serializeSketch([box("rectangle", 0, 589, 20, 20)], frame).boxes[0].position.vertical).toBe("middle");
  });

  it("pins horizontal position boundaries at 1/3 and 2/3", () => {
    // center_x=100: 100/300=1/3 (NOT <1/3) → center; center_x=99 (<1/3) → left
    // To get center_x=100 with w=20: x=90; to get center_x=99: x=89
    expect(serializeSketch([box("rectangle", 90, 0, 20, 20)], frame).boxes[0].position.horizontal).toBe("center");
    expect(serializeSketch([box("rectangle", 89, 0, 20, 20)], frame).boxes[0].position.horizontal).toBe("left");
    // center_x=200: 200/300=2/3 (NOT <2/3) → right; center_x=199 (<2/3) → center
    // To get center_x=200 with w=20: x=190; to get center_x=199: x=189
    expect(serializeSketch([box("rectangle", 190, 0, 20, 20)], frame).boxes[0].position.horizontal).toBe("right");
    expect(serializeSketch([box("rectangle", 189, 0, 20, 20)], frame).boxes[0].position.horizontal).toBe("center");
  });

  it("normalizes whitespace-only text to null", () => {
    const out = serializeSketch([box("rectangle", 0, 0, 20, 20, "   ")], frame);
    expect(out.boxes[0].text).toBe(null);
  });
});

describe("shapeCenterInFrame", () => {
  it("is true when the shape center is inside the frame", () => {
    expect(shapeCenterInFrame({ x: 10, y: 10, w: 20, h: 20 }, frame)).toBe(true);
    expect(shapeCenterInFrame({ x: 400, y: 10, w: 20, h: 20 }, frame)).toBe(false);
  });
});
