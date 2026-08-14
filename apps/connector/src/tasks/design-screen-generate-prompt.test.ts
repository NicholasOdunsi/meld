import type { AIContextPackage } from "@meld/contracts";
import { DesignScreenPayloadSchema } from "@meld/prototype";
import { describe, expect, it } from "vitest";
import {
  DESIGN_SCREEN_GENERATE_PROMPT_VERSION,
  DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA,
  DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT,
  buildDesignScreenSystemPrompt,
} from "./design-screen-generate-prompt";

describe("design screen generate prompt", () => {
  it("is versioned", () => {
    expect(DESIGN_SCREEN_GENERATE_PROMPT_VERSION).toBe(
      "design-screen-generate-v1",
    );
  });

  it("emits a closed schema with markup, styles, script, and actions", () => {
    const schema = DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA as {
      additionalProperties: boolean;
      properties: Record<string, unknown>;
    };

    expect(schema.additionalProperties).toBe(false);
    expect(Object.keys(schema.properties).sort()).toEqual(
      ["actions", "markup", "script", "styles"].sort(),
    );
    expect(schema.properties.script).toEqual({ type: "null" });
  });

  it("tags each action with targetNodeId, not targetScreenId", () => {
    const schema = DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA as {
      properties: {
        actions: {
          items: {
            required: string[];
            properties: Record<string, unknown>;
          };
        };
      };
    };
    const actionItems = schema.properties.actions.items;

    expect(actionItems.required).toEqual(["id", "label", "targetNodeId"]);
    expect(actionItems.properties.targetNodeId).toEqual({
      type: ["string", "null"],
    });
    expect(actionItems.properties.targetScreenId).toBeUndefined();
  });

  it("instructs the model to set targetNodeId from the supplied NEXT STEPS list, never inventing one", () => {
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/NEXT STEPS/);
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/targetNodeId/);
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/never invent/i);
  });

  it("folds hydrated token CSS and the current screen version into the prompt", () => {
    const prompt = buildDesignScreenSystemPrompt({
      designProfile: {
        tokenCss: ":root{--ds-color-primary:#2f6feb}",
      },
      designScreen: {
        screenId: "11111111-1111-4111-8111-111111111111",
        flowNodeId: "pick_plan",
        baseVersionId: "22222222-2222-4222-8222-222222222222",
        currentVersion: {
          id: "33333333-3333-4333-8333-333333333333",
          markup: '<button data-meld-action="go">Old</button>',
          styles: "button{color:var(--ds-color-primary)}",
          actions: [{ id: "go", label: "Continue", targetScreenId: null }],
        },
      },
    } as unknown as AIContextPackage);

    expect(prompt).toContain("--ds-color-primary");
    expect(prompt).toContain("11111111-1111-4111-8111-111111111111");
    expect(prompt).toContain("pick_plan");
    expect(prompt).toContain("Old");
    expect(prompt).toContain("button{color:var(--ds-color-primary)}");
    expect(prompt).toContain("Continue");
    expect(prompt).toMatch(/untrusted/i);
    expect(prompt).toMatch(/data-meld-action/);
    expect(prompt).toMatch(/script.*null/i);
  });

  it.each([
    {},
    { designProfile: null, designScreen: null },
    {
      designProfile: null,
      designScreen: {
        screenId: "11111111-1111-4111-8111-111111111111",
        flowNodeId: null,
        baseVersionId: null,
        currentVersion: null,
      },
    },
  ])("handles first generation without pinned design context", (context) => {
    const prompt = buildDesignScreenSystemPrompt(
      context as unknown as AIContextPackage,
    );

    expect(prompt).toMatch(/only JSON/i);
    expect(prompt).toMatch(/no design system/i);
    expect(prompt).toMatch(/no current screen version/i);
  });

  it("describes output that validates against DesignScreenPayloadSchema", () => {
    expect(() =>
      DesignScreenPayloadSchema.parse({
        markup: '<button data-meld-action="go">Go</button>',
        styles: "button{padding:8px}",
        script: null,
        actions: [{ id: "go", label: "Go", targetScreenId: null }],
      }),
    ).not.toThrow();
  });

  it("parses a model response shaped by the response schema (id, label, targetNodeId)", () => {
    const parsed = DesignScreenPayloadSchema.parse({
      markup: '<button data-meld-action="go">Go</button>',
      styles: "button{padding:8px}",
      script: null,
      actions: [{ id: "go", label: "Go", targetNodeId: "pick_plan" }],
    });
    expect(parsed.actions[0]).toMatchObject({
      id: "go",
      label: "Go",
      targetNodeId: "pick_plan",
      targetScreenId: null,
    });
  });
});
