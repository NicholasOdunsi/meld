import { describe, expect, it } from "vitest";
import { displayValues, familyKey, firstFontName, nearestWeight, rgbToHex } from "./inspector-values";
import type { Field, Inspection } from "@meld/screen-runtime/edit/types";

// "@meld/screen-runtime/edit/types" is a types-only export, so FIELDS cannot be imported at runtime.
const FIELDS: readonly Field[] = ["text", "color", "backgroundColor", "fontSize", "fontWeight", "fontFamily", "padding", "gap", "borderRadius", "width", "height"];

const insp = (over: Record<string, { editable: boolean; value: string | null }> = {}) =>
  Object.fromEntries(FIELDS.map((f) => [f, over[f] ?? { editable: true, value: null }])) as NonNullable<Inspection>;
const computed = { fontFamily: '"Inter", system-ui, sans-serif', fontSize: "16", fontWeight: "500", color: "rgb(255, 255, 255)",
  backgroundColor: "rgb(18, 52, 86)", width: "120", height: "40", padding: "12", gap: "0", borderRadius: "6", display: "block" };

describe("inspector values", () => {
  it("converts colours and names fonts", () => {
    expect(rgbToHex("rgb(18, 52, 86)")).toBe("#123456");
    expect(rgbToHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(firstFontName('"Inter", system-ui')).toBe("Inter");
    expect(familyKey("ui-monospace, Menlo, monospace")).toBe("mono");
    expect(familyKey("Georgia, serif")).toBe("serif");
    expect(familyKey("Inter, sans-serif")).toBe("sans");
    expect(nearestWeight("650")).toBe("600");
    expect(nearestWeight("700")).toBe("700");
  });
  it("shows real numbers even when the source states nothing", () => {
    const v = displayValues(insp({ width: { editable: true, value: null } }), computed);
    expect(v.width).toMatchObject({ value: "120", auto: true, editable: true });
    expect(v.padding.value).toBe("12");
    expect(v.backgroundColor.value).toBe("#123456");
    expect(v.fontWeight.value).toBe("500");
    expect(v.fontFamily.value).toBe("sans");
  });
  it("hides gap unless the element lays out children, keeps code-owned fields dimmed", () => {
    expect(displayValues(insp(), computed).gap.hidden).toBe(true);
    expect(displayValues(insp(), { ...computed, display: "flex" }).gap.hidden).toBe(false);
    expect(displayValues(insp({ color: { editable: false, value: null } }), computed).color.editable).toBe(false);
  });
  it("hardens colour parsing and font family detection", () => {
    expect(rgbToHex("rgb(18.5 52 86)")).toBe("#133456");
    expect(rgbToHex("rgba(0, 0, 0, 0)")).toBeNull();
    expect(familyKey("Monotype Corsiva, cursive")).toBe("sans");
    expect(familyKey('Inter, system-ui, "Times New Roman"')).toBe("sans");
    expect(familyKey('"Courier New", monospace')).toBe("mono");
    expect(familyKey("Georgia")).toBe("serif");
  });
  it("never lets a non-numeric computed value reach the UI", () => {
    for (const bad of ["", "NaN", "auto", "12 8"]) {
      const v = displayValues(insp(), { ...computed, padding: bad, width: bad, fontSize: bad });
      expect(v.padding.value).toBeNull();
      expect(v.fontSize.value).toBeNull();
      expect(v.width).toMatchObject({ value: null, auto: true });
    }
    const v = displayValues(insp({ padding: { editable: true, value: "8" }, width: { editable: true, value: "90" } }), { ...computed, padding: "12 8", width: "auto" });
    expect(v.padding.value).toBe("8");
    expect(v.width).toMatchObject({ value: "90", auto: false });
  });
  it("falls back to the source when nothing was reported", () => {
    const v = displayValues(insp({ padding: { editable: true, value: "8" }, backgroundColor: { editable: true, value: "bg-red-500" } }), null);
    expect(v.padding.value).toBe("8");
    expect(v.backgroundColor.value).toBeNull();
  });
});
