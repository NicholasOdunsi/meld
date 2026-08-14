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

describe("canvasSketchSelection", () => {
  it("returns the selected frame + its contained non-meld shapes", () => {
    const r = canvasSketchSelection(
      editor([frameShape], [frameShape, sketch, flow], {
        "shape:screen-s1": frameBounds,
        "shape:geo1": { x: 20, y: 20, w: 40, h: 40 },
        "shape:flow1": { x: 10, y: 10, w: 20, h: 20 },
      }),
    )!;
    expect(r.targetScreenId).toBe("s1");
    expect(r.sketchShapes.map((s) => s.kind)).toEqual(["rectangle"]); // geo→rectangle; flow excluded by meta
    expect(r.frame).toEqual(frameBounds);
  });
  it("returns null when no screen frame is selected", () => {
    expect(
      canvasSketchSelection(editor([sketch], [sketch], { "shape:geo1": { x: 0, y: 0, w: 10, h: 10 } })),
    ).toBeNull();
  });
  it("excludes shapes whose center is outside the frame", () => {
    const r = canvasSketchSelection(
      editor([frameShape], [frameShape, sketch], {
        "shape:screen-s1": frameBounds,
        "shape:geo1": { x: 400, y: 20, w: 10, h: 10 },
      }),
    )!;
    expect(r.sketchShapes).toHaveLength(0);
  });
});
