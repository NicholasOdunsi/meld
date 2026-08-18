import { describe, expect, it } from "vitest";
import { canvasSketchSelection, type Bounds, type EditorShape } from "./use-canvas-selection";

const frameBounds: Bounds = { x: 0, y: 0, w: 300, h: 900 };
function editor(
  selected: EditorShape[],
  page: EditorShape[],
  bounds: Record<string, Bounds>,
) {
  return {
    getSelectedShapes: () => selected,
    getCurrentPageShapes: () => page,
    getShapePageBounds: (id: string) => bounds[id] ?? null,
  };
}
const frameShape = { id: "shape:screen-s1", type: "frame", meta: { meldScreenId: "s1" } };
const sketch = { id: "shape:geo1", type: "geo", meta: {} };
const flow = { id: "shape:flow1", type: "geo", meta: { meld: { flowNodeId: "n1" } } };
const frameShape2 = { id: "shape:screen-s2", type: "frame", meta: { meldScreenId: "s2" } };
const frame2Bounds: Bounds = { x: 400, y: 0, w: 300, h: 900 };

describe("canvasSketchSelection", () => {
  it("returns one entry per selected frame with its contained sketch shapes", () => {
    const r = canvasSketchSelection(
      editor([frameShape], [frameShape, sketch, flow], {
        "shape:screen-s1": frameBounds,
        "shape:geo1": { x: 20, y: 20, w: 40, h: 40 },
        "shape:flow1": { x: 10, y: 10, w: 20, h: 20 },
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].targetScreenId).toBe("s1");
    expect(r[0].sketchShapes.map((s) => s.kind)).toEqual(["rectangle"]);
    expect(r[0].frame).toEqual(frameBounds);
  });

  it("returns two entries when two frames are selected, ordered by frame.x", () => {
    const r = canvasSketchSelection(
      editor([frameShape2, frameShape], [frameShape, frameShape2], {
        "shape:screen-s1": frameBounds,
        "shape:screen-s2": frame2Bounds,
      }),
    );
    expect(r.map((e) => e.targetScreenId)).toEqual(["s1", "s2"]);
  });

  it("resolves a selected loose sketch shape to its containing screen even when the frame is not selected", () => {
    const r = canvasSketchSelection(
      editor([sketch], [frameShape, sketch], {
        "shape:screen-s1": frameBounds,
        "shape:geo1": { x: 20, y: 20, w: 40, h: 40 },
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].targetScreenId).toBe("s1");
    expect(r[0].sketchShapes).toHaveLength(1);
  });

  it("returns empty when nothing (or only flow) is selected", () => {
    expect(canvasSketchSelection(editor([], [sketch], { "shape:geo1": { x: 0, y: 0, w: 10, h: 10 } }))).toEqual([]);
    expect(
      canvasSketchSelection(editor([flow], [flow], { "shape:flow1": { x: 0, y: 0, w: 10, h: 10 } })),
    ).toEqual([]);
  });

  it("resolves a free sketch outside any frame to a new-screen entry (targetScreenId null) whose frame is the sketch bounding box", () => {
    const sketchB = { id: "shape:geo2", type: "geo", meta: {} };
    const r = canvasSketchSelection(
      editor([sketch, sketchB], [sketch, sketchB], {
        "shape:geo1": { x: 100, y: 50, w: 40, h: 40 },
        "shape:geo2": { x: 200, y: 300, w: 60, h: 20 },
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].targetScreenId).toBeNull();
    expect(r[0].sketchShapes).toHaveLength(2);
    // Bounding box of the two shapes: x 100..260, y 50..320.
    expect(r[0].frame).toEqual({ x: 100, y: 50, w: 160, h: 270 });
  });

  it("keeps existing-frame entries and adds one new-screen entry for free sketches outside frames", () => {
    const outside = { id: "shape:geo9", type: "geo", meta: {} };
    const r = canvasSketchSelection(
      editor([frameShape, outside], [frameShape, outside], {
        "shape:screen-s1": frameBounds,
        "shape:geo9": { x: 900, y: 10, w: 30, h: 30 },
      }),
    );
    expect(r).toHaveLength(2);
    expect(r[0].targetScreenId).toBe("s1");
    expect(r[1].targetScreenId).toBeNull();
    expect(r[1].sketchShapes).toHaveLength(1);
  });

  it("dedupes when both a frame and a sketch inside it are selected", () => {
    const r = canvasSketchSelection(
      editor([frameShape, sketch], [frameShape, sketch], {
        "shape:screen-s1": frameBounds,
        "shape:geo1": { x: 20, y: 20, w: 40, h: 40 },
      }),
    );
    expect(r).toHaveLength(1);
    expect(r[0].targetScreenId).toBe("s1");
  });
});
