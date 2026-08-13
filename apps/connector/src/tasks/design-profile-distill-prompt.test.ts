import { DesignProfileSchema } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import {
  DESIGN_PROFILE_DISTILL_PROMPT_VERSION,
  DESIGN_PROFILE_DISTILL_RESPONSE_SCHEMA,
  DESIGN_PROFILE_DISTILL_SYSTEM_PROMPT,
} from "./design-profile-distill-prompt";

describe("design profile distill prompt", () => {
  it("has a versioned id and an untrusted-content rule", () => {
    expect(DESIGN_PROFILE_DISTILL_PROMPT_VERSION).toBe(
      "design-profile-distill-v1",
    );
    expect(DESIGN_PROFILE_DISTILL_SYSTEM_PROMPT).toMatch(/untrusted/i);
    expect(DESIGN_PROFILE_DISTILL_SYSTEM_PROMPT).toMatch(/only JSON/i);
  });

  it("emits a closed JSON schema whose top-level keys match the profile", () => {
    const schema = DESIGN_PROFILE_DISTILL_RESPONSE_SCHEMA as {
      additionalProperties: boolean;
      properties: Record<string, unknown>;
    };
    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual(
      ["colors", "components", "radii", "spacing", "typeScale"].sort(),
    );
  });

  it("a schema-shaped example validates against DesignProfileSchema", () => {
    const example = {
      colors: [{ name: "primary", value: "#2f6feb" }],
      typeScale: [{ name: "body", px: 16 }],
      spacing: [{ name: "md", px: 14 }],
      radii: [{ name: "md", px: 14 }],
      components: [{ name: "button", rules: "solid" }],
    };
    expect(() => DesignProfileSchema.parse(example)).not.toThrow();
  });
});
