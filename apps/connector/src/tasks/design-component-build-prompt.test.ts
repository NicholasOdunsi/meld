import { describe, expect, it } from "vitest";
import type { AIContextPackage } from "@meld/contracts";
import {
  buildDesignComponentSystemPrompt,
  parseComponentBuildResult,
} from "./design-component-build-prompt";

const context = {
  kind: "design_component_build",
  componentBuild: {
    tokenCss: ":root { --ds-color-rausch: #FF5A5F; }",
    targets: [{ name: "host-card", rules: "A rounded card with an avatar." }],
    references: [
      { name: "card", html: '<div class="ds-card"></div>', css: ".ds-card { }" },
    ],
  },
} as unknown as AIContextPackage;

describe("buildDesignComponentSystemPrompt", () => {
  it("names the component and quotes its rules", () => {
    const prompt = buildDesignComponentSystemPrompt(context);

    expect(prompt).toContain("host-card");
    expect(prompt).toContain("A rounded card with an avatar.");
  });

  it("supplies the tokens and the reference components", () => {
    const prompt = buildDesignComponentSystemPrompt(context);

    expect(prompt).toContain("--ds-color-rausch");
    expect(prompt).toContain('<div class="ds-card"></div>');
  });

  it("marks the design data untrusted", () => {
    expect(buildDesignComponentSystemPrompt(context)).toContain("UNTRUSTED");
  });
});

describe("parseComponentBuildResult", () => {
  it("keeps a well-formed component", () => {
    const parsed = parseComponentBuildResult({
      components: [
        { name: "host-card", html: '<div class="ds-host-card"></div>', css: ".ds-host-card { color: var(--ds-color-rausch); }" },
      ],
    });

    expect(parsed.components).toHaveLength(1);
    expect(parsed.components[0]?.name).toBe("host-card");
  });

  it("drops a component whose markup is unsafe and keeps the rest", () => {
    const parsed = parseComponentBuildResult({
      components: [
        { name: "bad", html: '<img src="https://evil.test/x.png">', css: ".ds-bad { }" },
        { name: "good", html: '<div class="ds-good"></div>', css: ".ds-good { }" },
      ],
    });

    expect(parsed.components.map((component) => component.name)).toEqual(["good"]);
  });
});
