import { expect, it } from "vitest";
import { hitTest, translateObjects, resizeObject, boundsBetween, strokeFromPoints } from "./interaction";
import type { CanvasDocument } from "./document";
const sample: CanvasDocument = {version: 1, objects: [{id: "r", kind: "rectangle", x: 10, y: 20, width: 100, height: 80}]};
it("hits topmost objects and ignores empty space", () => {
  expect(hitTest(sample, {x: 15, y: 25}, 4)).toBe("r");
  expect(hitTest(sample, {x: -100, y: -100}, 4)).toBeNull();
  expect(hitTest({...sample, objects: [...sample.objects, {...sample.objects[0], id: "top"}]}, {x: 20, y: 30}, 0)).toBe("top");
});
it("moves without mutation and resizes with positive dimensions", () => {
  expect(translateObjects(sample, ["r"], {x: 5, y: -3}).objects[0]).toMatchObject({x: 15, y: 17});
  expect(sample.objects[0].x).toBe(10);
  expect(translateObjects(sample, ["missing"], {x: 9, y: 9})).toEqual(sample);
  expect(resizeObject(sample, "r", {x: 10, y: 20, width: -4, height: 0}).objects[0]).toMatchObject({width: 1, height: 1});
  expect(boundsBetween({x: 100, y: 50}, {x: 10, y: 20})).toEqual({x: 10, y: 20, width: 90, height: 30});
});
it("normalizes strokes and hits segments instead of their bounding box", () => {
  const stroke = strokeFromPoints("s", [{x: 10, y: 10}, {x: 110, y: 110}]);
  const doc: CanvasDocument = {version: 1, objects: [stroke]};
  expect(hitTest(doc, {x: 60, y: 61}, 2)).toBe("s");
  expect(hitTest(doc, {x: 10, y: 110}, 2)).toBeNull();
  const resized = resizeObject(doc, "s", {x: 10, y: 10, width: 200, height: 200});
  expect(hitTest(resized, {x: 209, y: 210}, 2)).toBe("s");
  expect(strokeFromPoints("dot", [{x: 1, y: 1}]).width).toBe(1);
});
