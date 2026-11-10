import { expect, it } from "vitest";
import { createHistory, redo, replaceDocument, undo } from "./commands";
import type { CanvasDocument } from "./document";
const blank: CanvasDocument = { version: 1, objects: [] };
const sample: CanvasDocument = {version: 1, objects: [{id: "r", kind: "rectangle", x: 1, y: 2, width: 3, height: 4}]};
it("undoes, redoes, invalidates redo and leaves inputs untouched", () => {
  const first = createHistory(blank), changed = replaceDocument(first, sample);
  expect(undo(changed).present).toEqual(blank);
  expect(redo(undo(changed)).present).toEqual(sample);
  expect(replaceDocument(undo(changed), {...sample, objects: [{...sample.objects[0], x: 9}]}).future).toEqual([]);
  expect(first.present).toEqual(blank);
  expect(undo(first)).toBe(first);
  expect(redo(first)).toBe(first);
});
it("limits history to 100 and ignores identical edits", () => {
  let history = createHistory(blank);
  expect(replaceDocument(history, blank)).toBe(history);
  for (let n = 0; n < 120; n++) history = replaceDocument(history, {
    version: 1, objects: [{...sample.objects[0], x: n}],
  });
  expect(history.past).toHaveLength(100);
});
