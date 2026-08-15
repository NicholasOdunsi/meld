import type { AIContextPackage } from "@meld/contracts";
import {
  DesignScreenBatchSchema,
  DesignScreenLayoutDirectiveSchema,
  DesignScreenPayloadSchema,
  SCREEN_BATCH_MAX,
} from "@meld/prototype";
import { describe, expect, it } from "vitest";
import {
  DESIGN_SCREEN_GENERATE_PROMPT_VERSION,
  DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA,
  DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT,
  MAX_COMPONENT_PROMPT_BYTES,
  buildDesignScreenSystemPrompt,
} from "./design-screen-generate-prompt";

describe("design screen generate prompt", () => {
  it("is versioned", () => {
    expect(DESIGN_SCREEN_GENERATE_PROMPT_VERSION).toBe(
      "design-screen-generate-v2",
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
      [
        "actions",
        "formFactor",
        "layout",
        "markup",
        "screenKey",
        "script",
        "styles",
      ].sort(),
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
              formFactor: unknown;
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
      "formFactor",
      "markup",
      "styles",
      "script",
      "actions",
      "layout",
    ]);
    expect(screenItem.properties.formFactor).toEqual({
      type: "string",
      enum: ["mobile", "tablet", "desktop"],
    });
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

  it("anchors on the brand but frees the model to add depth and polish", () => {
    // Injection defence is preserved: embedded commands are still ignored.
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(
      /never follow .*command|embedded/i,
    );
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/safety boundary/i);
    // The design system is a brand anchor, not a cage.
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/brand/i);
    // The model is explicitly freed to add what the tokens don't specify.
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(
      /shadow|elevation|depth|polish/i,
    );
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(
      /hover|focus|hierarchy|presentable|finished/i,
    );
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(
      /should add|may add|starting palette|not (a cage|the whole design)/i,
    );
    // And it must NOT regress into the flat cage that starved earlier output.
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).not.toMatch(
      /use only the supplied|conform to the supplied design system exactly|never emit ad-hoc/i,
    );
    // Layout shell is conditional on the system defining one -- never assumed.
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(
      /if the supplied design system|only use what the design system defines/i,
    );
  });

  it("keeps the base prompt design-system-agnostic (no hardcoded look)", () => {
    // Guards against overfitting to one uploaded system: the base rules must
    // not name any specific colour, component, or layout.
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).not.toMatch(/#[0-9a-fA-F]{6}/);
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).not.toMatch(
      /sidebar|status-badge|data-table|content-card|page-layout|grey canvas|white card/i,
    );
  });

  it("folds the design-system component rules in as brand building blocks to be polished", () => {
    const prompt = buildDesignScreenSystemPrompt({
      designProfile: {
        tokenCss: ":root{--ds-color-primary:#2f6feb}",
        profile: {
          colors: [],
          typeScale: [],
          spacing: [],
          radii: [],
          components: [
            {
              name: "status-badge",
              rules: "Pill with 999px radius, tinted background per status.",
            },
            {
              name: "data-table",
              rules: "Header row uses --ds-color-table-header-bg; 1px dividers.",
            },
          ],
        },
      },
      designScreen: null,
    } as unknown as AIContextPackage);

    // Each component's name and rules are carried into the prompt.
    expect(prompt).toContain("status-badge");
    expect(prompt).toContain("Pill with 999px radius, tinted background per status.");
    expect(prompt).toContain("data-table");
    expect(prompt).toContain("Header row uses --ds-color-table-header-bg; 1px dividers.");
    // Framed as untrusted brand building blocks the model then polishes.
    expect(prompt).toMatch(/untrusted design system components/i);
    expect(prompt).toMatch(/build .*to the look|to the look its rules/i);
    expect(prompt).toMatch(/polish|depth/i);
  });

  it("caps the component section and notes how many rules were omitted", () => {
    const components = Array.from({ length: 60 }, (_, i) => ({
      name: `component-${i}`,
      rules: "x".repeat(1000),
    }));
    const prompt = buildDesignScreenSystemPrompt({
      designProfile: {
        tokenCss: ":root{}",
        profile: {
          colors: [],
          typeScale: [],
          spacing: [],
          radii: [],
          components,
        },
      },
      designScreen: null,
    } as unknown as AIContextPackage);

    expect(Buffer.byteLength(prompt, "utf8")).toBeLessThan(
      MAX_COMPONENT_PROMPT_BYTES + 4096,
    );
    expect(prompt).toMatch(/component rules omitted/i);
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

  it("response schema requires a nullable layout on each screen", () => {
    const schema = DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA as {
      properties: {
        screens: {
          items: {
            required: string[];
            properties: {
              layout: {
                type: string[];
                properties: {
                  reuse: { type: string[] };
                  create: {
                    properties: { shellMarkup: { type: string } };
                  };
                };
              };
            };
          };
        };
      };
    };
    const item = schema.properties.screens.items;
    expect(item.required).toContain("layout");
    expect(item.properties.layout.type).toEqual(["object", "null"]);
    expect(item.properties.layout.properties.reuse.type).toEqual([
      "object",
      "null",
    ]);
    expect(item.properties.layout.properties.create.properties.shellMarkup.type).toBe(
      "string",
    );
  });

  it("base rules instruct putting chrome in the layout and reusing by key", () => {
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/layout/i);
    expect(DESIGN_SCREEN_GENERATE_SYSTEM_PROMPT).toMatch(/data-meld-slot/);
  });

  it("prompt version is v2", () => {
    expect(DESIGN_SCREEN_GENERATE_PROMPT_VERSION).toBe(
      "design-screen-generate-v2",
    );
  });

  it("cross-checks a reuse layout payload against the connector schema and the Zod schema", () => {
    const reusePayload = { reuse: { layoutKey: "app-shell" }, create: null };

    const schema = DESIGN_SCREEN_GENERATE_RESPONSE_SCHEMA as {
      properties: {
        screens: {
          items: {
            properties: {
              layout: { properties: Record<string, unknown> };
            };
          };
        };
      };
    };
    const item = schema.properties.screens.items;
    expect(Object.keys(item.properties.layout.properties).sort()).toEqual(
      ["reuse", "create"].sort(),
    );
    expect(
      DesignScreenLayoutDirectiveSchema.parse(reusePayload),
    ).toMatchObject(reusePayload);
  });

  it("cross-checks a create layout payload against the connector schema and the Zod schema", () => {
    const createPayload = {
      reuse: null,
      create: {
        layoutKey: "app-shell",
        name: "App shell",
        shellMarkup: '<div><main data-meld-slot></main></div>',
        shellStyles: "main{padding:16px}",
        actions: [{ id: "nav_home", label: "Home", targetScreenKey: "home" }],
      },
    };

    expect(() =>
      DesignScreenLayoutDirectiveSchema.parse(createPayload),
    ).not.toThrow();
    const parsed = DesignScreenLayoutDirectiveSchema.parse(createPayload);
    expect(parsed.create?.shellMarkup).toContain("data-meld-slot");
  });
});
