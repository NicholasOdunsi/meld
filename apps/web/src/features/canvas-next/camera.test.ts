import { expect, it } from "vitest";
import { toScreen, toWorld, zoomAt } from "./camera";
it("round trips coordinates and keeps the zoom anchor fixed", () => {
  const camera = { x: 40, y: -20, zoom: 2 }, point = { x: 100, y: 50 };
  expect(toWorld(toScreen(point, camera), camera)).toEqual(point);
  const anchor = { x: 200, y: 120 };
  expect(toWorld(anchor, zoomAt(camera, anchor, 4))).toEqual(toWorld(anchor, camera));
  expect(zoomAt(camera, anchor, 100).zoom).toBe(8);
  expect(zoomAt(camera, anchor, 0).zoom).toBe(0.1);
});
it("rejects nonfinite coordinates and invalid cameras", () => {
  expect(() => toWorld({x: 0, y: 0}, {x: 0, y: 0, zoom: 0})).toThrow();
  expect(() => zoomAt({x: 0, y: 0, zoom: 1}, {x: 0, y: 0}, NaN)).toThrow();
  expect(() => toScreen({x: Infinity, y: 0}, {x: 0, y: 0, zoom: 1})).toThrow();
});
