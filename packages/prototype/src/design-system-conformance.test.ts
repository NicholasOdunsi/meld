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

const TOKENS = ":root {\n  --ds-color-rausch: #FF5A5F;\n  --ds-color-ink: rgb(34, 34, 34);\n}";

describe("hardcoded colours", () => {
  it("rewrites an exact hex match to its token", () => {
    const result = enforceDesignSystem({
      styles: ".hero { color: #ff5a5f; }",
      tokenCss: TOKENS,
    });

    expect(result.styles).toContain("color: var(--ds-color-rausch)");
    expect(result.corrections).toBe(1);
  });

  it("matches the same colour written as rgb()", () => {
    const result = enforceDesignSystem({
      styles: ".hero { color: rgb(255, 90, 95); }",
      tokenCss: TOKENS,
    });

    expect(result.styles).toContain("var(--ds-color-rausch)");
  });

  it("matches a token whose own value is an rgb() literal", () => {
    const result = enforceDesignSystem({
      styles: ".hero { color: #222222; }",
      tokenCss: TOKENS,
    });

    expect(result.styles).toContain("var(--ds-color-ink)");
  });

  it("expands three-digit hex before comparing", () => {
    const result = enforceDesignSystem({
      styles: ".hero { color: #222; }",
      tokenCss: TOKENS,
    });

    expect(result.styles).toContain("var(--ds-color-ink)");
  });

  it("reports a colour matching no token and leaves it in place", () => {
    const result = enforceDesignSystem({
      styles: ".hero { color: #010203; }",
      tokenCss: TOKENS,
    });

    expect(result.styles).toContain("#010203");
    expect(result.corrections).toBe(0);
    expect(result.findings).toEqual([
      { rule: "token-color", detail: ".hero uses #010203, which matches no token" },
    ]);
  });

  it("leaves hsl() and named colours alone", () => {
    const styles = ".hero { color: hsl(0, 0%, 0%); background: red; }";
    const result = enforceDesignSystem({ styles, tokenCss: TOKENS });

    expect(result.styles).toBe(styles);
    expect(result.corrections).toBe(0);
  });

  it("does not rewrite a value that already uses a token", () => {
    const styles = ".hero { color: var(--ds-color-rausch); }";

    expect(enforceDesignSystem({ styles, tokenCss: TOKENS }).styles).toBe(styles);
  });

  it("applies both rules to one rule set", () => {
    const result = enforceDesignSystem({
      styles: ".ds-card { background: #fff; margin: 0; } .hero { color: #ff5a5f; }",
      tokenCss: TOKENS,
    });

    expect(result.corrections).toBe(2);
    expect(result.styles).toContain("margin: 0");
    expect(result.styles).toContain("var(--ds-color-rausch)");
  });

  it("leaves colours with alpha unchanged (8-digit hex)", () => {
    const styles = ".hero { color: #FF5A5F80; }";
    const result = enforceDesignSystem({ styles, tokenCss: TOKENS });

    expect(result.styles).toBe(styles);
    expect(result.corrections).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("leaves colours with alpha unchanged (rgba)", () => {
    const styles = ".hero { color: rgba(255, 90, 95, 0.5); }";
    const result = enforceDesignSystem({ styles, tokenCss: TOKENS });

    expect(result.styles).toBe(styles);
    expect(result.corrections).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("leaves percentage-based rgb() unchanged", () => {
    const styles = ".hero { color: rgb(50%, 50%, 50%); }";
    const result = enforceDesignSystem({ styles, tokenCss: TOKENS });

    expect(result.styles).toBe(styles);
    expect(result.corrections).toBe(0);
    expect(result.findings).toEqual([]);
  });

  it("skips colour mapping in url() values", () => {
    const styles = ".hero { background: url(icons.svg#abc); }";
    const result = enforceDesignSystem({ styles, tokenCss: TOKENS });

    expect(result.styles).toBe(styles);
    expect(result.corrections).toBe(0);
    expect(result.findings).toEqual([]);
  });
});
