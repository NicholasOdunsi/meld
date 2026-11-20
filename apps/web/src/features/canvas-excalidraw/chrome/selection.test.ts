import { describe, expect, it } from "vitest";
import { frameLink } from "../frame-link";
import { describeSelection, sceneToContainer } from "./selection";

const rect = { id: "r", type: "rectangle", x: 10, y: 20, width: 100, height: 50 };
const label = { id: "t", type: "text", x: 0, y: 0, width: 40, height: 10 };
const screen = { id: "s", type: "embeddable", x: 200, y: 0, width: 390, height: 844, link: frameLink("ds-abc") };

describe("describeSelection", () => {
  it("returns null with nothing selected", () => {
    expect(describeSelection([rect], {})).toBeNull();
  });
  it("recognises a single screen", () => {
    expect(describeSelection([screen], { s: true })).toMatchObject({ kind: "screen", screenId: "ds-abc", ids: ["s"] });
  });
  it("recognises text-only selections", () => {
    expect(describeSelection([label], { t: true })?.kind).toBe("text");
  });
  it("treats mixed selections as shapes with a union box", () => {
    expect(describeSelection([rect, label], { r: true, t: true })).toEqual({
      kind: "shape", ids: ["r", "t"], screenId: null, bounds: { x: 0, y: 0, width: 110, height: 70 },
    });
  });
  it("ignores deleted elements", () => {
    expect(describeSelection([{ ...rect, isDeleted: true }], { r: true })).toBeNull();
  });
});

describe("sceneToContainer", () => {
  it("applies scroll then zoom", () => {
    expect(sceneToContainer({ x: 10, y: 20 }, { scrollX: 5, scrollY: -5, zoom: 2 })).toEqual({ x: 30, y: 30 });
  });
});
