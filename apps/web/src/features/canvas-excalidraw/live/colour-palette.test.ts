import { describe, expect, it } from "vitest";
import { PALETTE, normaliseHex, usedColours } from "./colour-palette";
describe("colour palette", () => {
  it("normalises hex input", () => {
    expect(normaliseHex("#ABC")).toBe("#aabbcc");
    expect(normaliseHex("123456")).toBe("#123456");
    expect(normaliseHex("#12345")).toBeNull();
    expect(normaliseHex("red")).toBeNull();
  });
  it("collects each colour used in the source once, in order, capped at 8", () => {
    const files = { "a.tsx": 'x="#FF0000" y="bg-[#00ff00]" z="#ff0000" #abc', "b.css": "a{color:#112233}" };
    expect(usedColours(files)).toEqual(["#ff0000", "#00ff00", "#aabbcc", "#112233"]);
    const many = { "a.css": Array.from({ length: 12 }, (_, i) => `#0000${i.toString(16).padStart(2, "0")}`).join(" ") };
    expect(usedColours(many)).toHaveLength(8);
  });
  it("appends extra colours after the source colours", () => {
    expect(usedColours({ "a.css": "#111111" }, ["#222222", "#111111"])).toEqual(["#111111", "#222222"]);
  });
  it("is a clean grid of valid colours", () => {
    expect(PALETTE).toHaveLength(9);
    for (const row of PALETTE) for (const c of row) expect(normaliseHex(c)).toBe(c);
  });
});
