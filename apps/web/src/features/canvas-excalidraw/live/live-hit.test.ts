import { describe, expect, it } from "vitest";
import { isInsideScreen, screenAt } from "./live-hit";

const screen = (id: string, x: number, extra: object = {}) => ({ type: "embeddable", x, y: 0, width: 100, height: 200, link: `orion-screen://${id}`, ...extra });
const elements = [screen("ds-a", 0), screen("ds-b", 50), { type: "rectangle", x: 300, y: 0, width: 50, height: 50 }, screen("gone", 400, { isDeleted: true })];

describe("live hit testing", () => {
  it("finds the topmost screen under a point", () => {
    expect(screenAt(elements, { x: 75, y: 10 })).toBe("ds-b");
    expect(screenAt(elements, { x: 10, y: 10 })).toBe("ds-a");
    expect(screenAt(elements, { x: 310, y: 10 })).toBeNull();
    expect(screenAt(elements, { x: 450, y: 10 })).toBeNull();
    expect(screenAt([{ type: "embeddable", x: 0, y: 0, width: 10, height: 10, link: "https://x" }], { x: 1, y: 1 })).toBeNull();
  });
  it("tells whether a point is on the live screen", () => {
    expect(isInsideScreen(elements, "ds-a", { x: 10, y: 199 })).toBe(true);
    expect(isInsideScreen(elements, "ds-a", { x: 101, y: 10 })).toBe(false);
    expect(isInsideScreen(elements, "missing", { x: 10, y: 10 })).toBe(false);
  });
});
