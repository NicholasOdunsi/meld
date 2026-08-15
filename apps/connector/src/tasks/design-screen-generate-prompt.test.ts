import type { AIContextPackage } from "@meld/contracts";
import {
  DesignScreenBatchSchema,
  DesignScreenPayloadSchema,
  SCREEN_BATCH_MAX,
} from "@meld/prototype";
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

  it("emits a closed schema wrapping a batch of screens", () => {
    const schema = DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA as {
      additionalProperties: boolean;
      required: string[];
      properties: {
        screens: {
          type: string;
          minItems: number;
          maxItems: number;
          items: {
            additionalProperties: boolean;
            properties: Record<string, unknown>;
          };
        };
      };
    };

    expect(schema.additionalProperties).toBe(false);
    expect(schema.required).toEqual(["screens"]);
    expect(schema.properties.screens.type).toBe("array");
    expect(schema.properties.screens.minItems).toBe(1);
    expect(schema.properties.screens.maxItems).toBe(SCREEN_BATCH_MAX);

    const item = schema.properties.screens.items;
    expect(item.additionalProperties).toBe(false);
    expect(Object.keys(item.properties).sort()).toEqual(
      ["actions", "markup", "screenKey", "script", "styles"].sort(),
    );
    expect(item.properties.script).toEqual({ type: "null" });
  });

  it("tags each screen with screenKey and each action with targetScreenKey, not targetScreenId", () => {
    const schema = DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA as {
      properties: {
        screens: {
          items: {
            required: string[];
            properties: {
              screenKey: unknown;
              actions: {
                items: {
                  required: string[];
                  properties: Record<string, unknown>;
                };
              };
            };
          };
        };
      };
    };
    const screenItem = schema.properties.screens.items;

    expect(screenItem.required).toEqual([
      "screenKey",
      "markup",
      "styles",
      "script",
      "actions",
    ]);
    expect(screenItem.properties.screenKey).toEqual({
      type: "string",
      pattern: "^[a-z][a-z0-9_-]{0,63}$",
    });

    const actionItems = screenItem.properties.actions.items;
    expect(actionItems.required).toEqual(["id", "label", "targetScreenKey"]);
    expect(actionItems.properties.targetScreenKey).toEqual({
      type: ["string", "null"],
    });
    expect(actionItems.properties.targetScreenId).toBeUndefined();
  });

  it("instructs the model to batch screens as separate array items, key them, and link by targetScreenKey", () => {
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(
      /separate array items/i,
    );
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/screenKey/);
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/targetScreenKey/);
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/dangling target/i);
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

  it("describes each screen as validating against DesignScreenPayloadSchema", () => {
    expect(() =>
      DesignScreenPayloadSchema.parse({
        screenKey: "home",
        markup: '<button data-meld-action="go">Go</button>',
        styles: "button{padding:8px}",
        script: null,
        actions: [{ id: "go", label: "Go", targetScreenKey: null }],
      }),
    ).not.toThrow();
  });

  it("parses a model response shaped by the response schema (screens[], screenKey, targetScreenKey)", () => {
    const parsed = DesignScreenBatchSchema.parse({
      screens: [
        {
          screenKey: "home",
          markup: '<button data-meld-action="go">Go</button>',
          styles: "button{padding:8px}",
          script: null,
          actions: [{ id: "go", label: "Go", targetScreenKey: "pick_plan" }],
        },
      ],
    });
    expect(parsed.screens[0].screenKey).toBe("home");
    expect(parsed.screens[0].actions[0]).toMatchObject({
      id: "go",
      label: "Go",
      targetScreenKey: "pick_plan",
      targetScreenId: null,
    });
  });
});
