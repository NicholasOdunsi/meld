import { describe, expect, it } from "vitest";
import { compileTokenCss } from "./token-css";

const profile = {
  colors: [
    { name: "primary", value: "#2f6feb" },
    { name: "text", value: "#e6edf3" },
  ],
  typeScale: [{ name: "body", px: 16 }],
  spacing: [{ name: "md", px: 14 }],
  radii: [{ name: "md", px: 14 }],
  components: [{ name: "button", rules: "solid" }],
};

describe("compileTokenCss", () => {
  it("emits kebab custom properties under :root", () => {
    const css = compileTokenCss(profile);
    expect(css).toContain(":root {");
    expect(css).toContain("--ds-color-primary: #2f6feb;");
    expect(css).toContain("--ds-font-body: 16px;");
    expect(css).toContain("--ds-space-md: 14px;");
    expect(css).toContain("--ds-radius-md: 14px;");
  });

  it("is deterministic for identical input", () => {
    expect(compileTokenCss(profile)).toBe(compileTokenCss(profile));
  });

  it("does not emit component rules (they are guidance for the model, not CSS)", () => {
    expect(compileTokenCss(profile)).not.toContain("solid");
  });
});
