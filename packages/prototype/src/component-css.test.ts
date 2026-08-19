import { describe, expect, it } from "vitest";
import { compileComponentCss } from "./component-css";
const base = { colors: [], typeScale: [], spacing: [], radii: [] };
describe("compileComponentCss", () => {
  it("concatenates component css with name markers", () => {
    const css = compileComponentCss({ ...base, components: [
      { name: "button", rules: "x", css: ".ds-button{font-weight:600}" },
      { name: "card", rules: "x", css: ".ds-card{border:1px}" },
    ]} as never);
    expect(css).toContain("/* ds:button */");
    expect(css).toContain(".ds-button{font-weight:600}");
    expect(css).toContain(".ds-card{border:1px}");
  });
  it("returns empty when no component has css", () => {
    expect(compileComponentCss({ ...base, components: [{ name: "button", rules: "x" }] } as never)).toBe("");
  });
});
