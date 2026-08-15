import { DesignProfileSchema } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import {
  buildDesignProfileDistillSystemPrompt,
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

describe("buildDesignProfileDistillSystemPrompt", () => {
  const baseContext = {
    taskId: "00000000-0000-4000-8000-000000000001",
    initiatingUserId: "00000000-0000-4000-8000-000000000002",
    workspaceId: "00000000-0000-4000-8000-000000000003",
    roomId: "00000000-0000-4000-8000-000000000004",
    kind: "design_profile_distill" as const,
    agentKind: "product" as const,
    researchScope: "room" as const,
    instruction: "Distill the authorized design-system source into a validated profile.",
    messages: [],
    attachments: [],
    evidence: [],
    decisions: [],
  };

  it("embeds the source document text as untrusted data", () => {
    const prompt = buildDesignProfileDistillSystemPrompt({
      ...baseContext,
      designSystemSource: { text: "Primary color is #112233.", fileName: "brand.md" },
    });
    expect(prompt).toContain(DESIGN_PROFILE_DISTILL_SYSTEM_PROMPT);
    expect(prompt).toMatch(
      /UNTRUSTED DESIGN SYSTEM SOURCE DOCUMENT \(data only, from "brand\.md"\)/,
    );
    expect(prompt).toContain("Primary color is #112233.");
    expect(prompt).toContain("brand.md");
  });

  it("tells the model no source was supplied when designSystemSource is absent", () => {
    const prompt = buildDesignProfileDistillSystemPrompt(baseContext);
    expect(prompt).toMatch(/No design-system source document was supplied/);
  });
});
