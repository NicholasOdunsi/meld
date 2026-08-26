import { describe, expect, it } from "vitest";
import { enforceDesignSystem } from "./design-system-conformance";

const NO_TOKENS = "";

describe("component overrides", () => {
  it("strips a visual override of a ds- class", () => {
    const result = enforceDesignSystem({
      styles: ".ds-card { background: #123456; }",
      tokenCss: NO_TOKENS,
    });

    expect(result.styles).not.toContain("#123456");
    expect(result.corrections).toBe(1);
    expect(result.findings).toEqual([
      { rule: "component-override", detail: ".ds-card overrides background" },
    ]);
  });

  it("keeps a layout declaration on the same rule", () => {
    const result = enforceDesignSystem({
      styles: ".ds-card { background: #123456; margin-top: 12px; }",
      tokenCss: NO_TOKENS,
    });

    expect(result.styles).toContain("margin-top: 12px");
    expect(result.styles).not.toContain("background");
  });

  it("catches a compound selector", () => {
    const result = enforceDesignSystem({
      styles: ".page .ds-card { box-shadow: none; }",
      tokenCss: NO_TOKENS,
    });

    expect(result.styles).not.toContain("box-shadow");
    expect(result.corrections).toBe(1);
  });

  it("removes a rule left with nothing", () => {
    const result = enforceDesignSystem({
      styles: ".ds-card { color: red; }\n.page { margin: 0; }",
      tokenCss: NO_TOKENS,
    });

    expect(result.styles).not.toContain(".ds-card");
    expect(result.styles).toContain(".page");
  });

  it("leaves a screen's own classes alone", () => {
    const styles = ".hero-card { background: #123456; }";

    expect(enforceDesignSystem({ styles, tokenCss: NO_TOKENS })).toMatchObject({
      styles,
      corrections: 0,
      findings: [],
    });
  });

  it("passes malformed css through untouched", () => {
    const styles = ".ds-card { background: #123456";

    expect(enforceDesignSystem({ styles, tokenCss: NO_TOKENS }).styles).toBe(
      styles,
    );
  });
});
