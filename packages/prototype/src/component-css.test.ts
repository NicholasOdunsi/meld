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

// The exact byte-for-byte output for one fixture. `public.compile_design_component_css`
// (202608270009) is the database's transliteration of this function -- it is
// what produces `component_css` for every version a build pass merges -- and
// supabase/tests/compile_design_component_css.test.sql pins the SAME fixture
// to the SAME string. If either implementation drifts, one of the two tests
// fails rather than a design system quietly rendering with the wrong CSS.
describe("compileComponentCss / compile_design_component_css parity", () => {
  const PARITY_PROFILE = {
    ...base,
    components: [
      { name: "built_a", rules: "x", css: ".ds-built-a { color: red; }" },
      { name: "prose_b", rules: "x" },
      { name: "built_c", rules: "x", css: ".ds-built-c { padding: 4px; }" },
    ],
  };
  const PARITY_CSS =
    "/* ds:built_a */\n.ds-built-a { color: red; }\n" +
    "/* ds:built_c */\n.ds-built-c { padding: 4px; }";

  it("produces the pinned string the database function is pinned to", () => {
    expect(compileComponentCss(PARITY_PROFILE as never)).toBe(PARITY_CSS);
  });
});
