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

  it("allows optional html/css on distilled components", () => {
    const item = (DESIGN_PROFILE_DISTILL_RESPONSE_SCHEMA.properties as {
      components: { items: { properties: Record<string, unknown> } };
    }).components.items.properties;
    expect(item).toHaveProperty("html");
    expect(item).toHaveProperty("css");
  });

  // Codex runs this through `--output-schema`, i.e. strict structured output:
  // every declared property must also be required, and "optional" is expressed
  // by allowing null -- not by leaving the key out of `required`. A schema that
  // breaks the rule is rejected outright, which surfaces to the user as
  // "Distillation did not complete. Try again." with nothing to act on.
  it("declares every property required, the way strict output schemas demand", () => {
    const offenders: string[] = [];
    const walk = (node: unknown, path: string) => {
      if (!node || typeof node !== "object") return;
      const schema = node as {
        type?: unknown;
        properties?: Record<string, unknown>;
        required?: string[];
        items?: unknown;
      };
      if (schema.properties) {
        const declared = Object.keys(schema.properties).sort();
        const required = [...(schema.required ?? [])].sort();
        if (declared.join() !== required.join()) {
          offenders.push(
            `${path}: properties [${declared}] but required [${required}]`,
          );
        }
        for (const [key, child] of Object.entries(schema.properties)) {
          walk(child, `${path}.${key}`);
        }
      }
      if (schema.items) walk(schema.items, `${path}[]`);
    };
    walk(DESIGN_PROFILE_DISTILL_RESPONSE_SCHEMA, "root");
    expect(offenders).toEqual([]);
  });

  it("spells optional html/css as nullable, since they must stay required", () => {
    const item = (DESIGN_PROFILE_DISTILL_RESPONSE_SCHEMA.properties as {
      components: {
        items: { properties: Record<string, { type?: unknown }> };
      };
    }).components.items.properties;
    expect(item.html.type).toEqual(["string", "null"]);
    expect(item.css.type).toEqual(["string", "null"]);
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
