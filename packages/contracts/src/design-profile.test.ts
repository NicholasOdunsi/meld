import { describe, expect, it } from "vitest";
import {
  DesignProfileSchema,
  DesignProfileDistillResultSchema,
  MAX_PROFILE_BYTES,
  MAX_PROFILE_COLORS,
  MAX_PROFILE_COMPONENTS,
} from "./design-profile";

function validProfile() {
  return {
    colors: [
      { name: "primary", value: "#2f6feb" },
      { name: "text", value: "#e6edf3" },
    ],
    typeScale: [
      { name: "body", px: 16 },
      { name: "h1", px: 26 },
    ],
    spacing: [
      { name: "sm", px: 8 },
      { name: "md", px: 14 },
    ],
    radii: [{ name: "md", px: 14 }],
    components: [
      {
        name: "button",
        rules: "solid primary bg, 14px radius, 15px pad",
      },
    ],
  };
}

describe("DesignProfileSchema", () => {
  it("accepts a minimal profile", () => {
    expect(DesignProfileSchema.parse(validProfile()).colors).toHaveLength(2);
  });

  it("rejects a non-CSS colour value", () => {
    const p = validProfile();
    p.colors[0].value = "not a colour";
    expect(() => DesignProfileSchema.parse(p)).toThrow();
  });

  it("rejects duplicate colour names", () => {
    const p = validProfile();
    p.colors.push({ name: "primary", value: "#000000" });
    expect(() => DesignProfileSchema.parse(p)).toThrow(
      "Duplicate colour name",
    );
  });

  it("enforces the colour count cap", () => {
    const p = validProfile();
    p.colors = Array.from({ length: MAX_PROFILE_COLORS + 1 }, (_, i) => ({
      name: `c${i}`,
      value: "#000000",
    }));
    expect(() => DesignProfileSchema.parse(p)).toThrow();
  });

  it("enforces the component count cap", () => {
    const p = validProfile();
    p.components = Array.from(
      { length: MAX_PROFILE_COMPONENTS + 1 },
      (_, i) => ({ name: `k${i}`, rules: "x" }),
    );
    expect(() => DesignProfileSchema.parse(p)).toThrow();
  });

  it("rejects a whole profile past the byte cap", () => {
    const p = validProfile();
    p.components = [{ name: "big", rules: "x".repeat(MAX_PROFILE_BYTES) }];
    expect(() => DesignProfileSchema.parse(p)).toThrow();
  });

  it("accepts optional component html/css and trims them", () => {
    const p = {
      colors: [], typeScale: [], spacing: [], radii: [],
      components: [{ name: "button", rules: "bold", html: "  <button class=\"ds-button\"></button> ", css: ".ds-button{font-weight:600}" }],
    };
    const parsed = DesignProfileSchema.parse(p);
    expect(parsed.components[0].html).toBe('<button class="ds-button"></button>');
    expect(parsed.components[0].css).toContain(".ds-button");
  });

  it("still parses prose-only components (html/css absent)", () => {
    const parsed = DesignProfileSchema.parse({ colors: [], typeScale: [], spacing: [], radii: [], components: [{ name: "button", rules: "bold" }] });
    expect(parsed.components[0].html).toBeUndefined();
  });
});

describe("DesignProfileDistillResultSchema", () => {
  it("wraps a profile with its compiled token css", () => {
    const parsed = DesignProfileDistillResultSchema.parse({
      profile: validProfile(),
      tokenCss: ":root{--ds-color-primary:#2f6feb}",
      componentCss: "",
    });
    expect(parsed.tokenCss).toContain("--ds-color-primary");
  });
  it("distill result carries componentCss", () => {
    const r = DesignProfileDistillResultSchema.parse({
      profile: { colors: [], typeScale: [], spacing: [], radii: [], components: [] },
      tokenCss: ":root{}", componentCss: ".ds-button{font-weight:600}",
    });
    expect(r.componentCss).toContain(".ds-button");
  });
});
