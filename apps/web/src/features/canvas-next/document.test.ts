import { describe, expect, it } from "vitest";
import { CanvasDocumentSchema, decodeCanvasDocument } from "./document";
const note = { id: "note", kind: "text", x: 10, y: 20, width: 200, height: 80, text: "Landing page" };
describe("canvas document", () => {
  it("round trips every object kind", () => {
    const objects = [note, { id: "rect", kind: "rectangle", x: 0, y: 0, width: 10, height: 10 },
      { id: "stroke", kind: "stroke", x: 0, y: 0, width: 1, height: 1, points: [{ x: 0, y: 0 }] },
      { id: "image", kind: "image", x: 0, y: 0, width: 10, height: 10, assetId: "reference" },
      { id: "html", kind: "html-frame", x: 0, y: 0, width: 300, height: 400, screenId: "screen" }];
    const doc = { version: 1, objects };
    expect(decodeCanvasDocument(JSON.stringify(doc))).toEqual(doc);
  });
  it.each([
    { version: 2, objects: [] }, { version: 1, objects: [note, note] },
    { version: 1, objects: [{ ...note, width: 0 }] },
    { version: 1, objects: [{ ...note, x: Infinity }] },
    { version: 1, objects: [{ ...note, text: "x".repeat(32001) }] },
    { version: 1, objects: [{ ...note, url: "https://external.test" }] },
    { version: 1, objects: [{ id: "s", kind: "stroke", x: 0, y: 0, width: 1, height: 1, points: [] }] },
    { version: 1, objects: Array.from({length: 5001}, (_, i) => ({...note, id: String(i)})) },
    { version: 1, objects: [{ id: "s", kind: "stroke", x: 0, y: 0, width: 1, height: 1, points: Array(10001).fill({x: 0, y: 0}) }] },
  ])("rejects invalid documents", doc => expect(CanvasDocumentSchema.safeParse(doc).success).toBe(false));
  it("bounds bytes before parsing", () => {
    expect(() => decodeCanvasDocument(" ".repeat(8 * 1024 * 1024 + 1))).toThrow();
    expect(() => decodeCanvasDocument("no json")).toThrow();
  });
});
