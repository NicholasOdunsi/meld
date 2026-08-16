import { MAX_RESULT_BYTES } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import {
  DesignScreenBatchSchema,
  DesignScreenLayoutDirectiveSchema,
  DesignScreenPayloadSchema,
  MAX_SCREEN_ACTIONS,
  MAX_SCREEN_MARKUP_BYTES,
  MAX_SCREEN_SCRIPT_BYTES,
  MAX_SCREEN_STYLES_BYTES,
  SCREEN_BATCH_MAX,
} from "./screen-payload";

describe("DesignScreenPayloadSchema", () => {
  it("accepts a minimal screen", () => {
    const payload = {
      markup: '<button data-meld-action="continue">Continue</button>',
      styles: "button { color: var(--meld-color-primary); }",
      script: null,
      actions: [
        {
          id: "continue",
          label: "Continue",
          targetScreenId: "9f3c1c62-0a1e-4f5e-9d2a-6b7c8d9e0f10",
        },
      ],
    };
    expect(DesignScreenPayloadSchema.parse(payload).actions).toHaveLength(1);
  });

  it("keeps legacy string scripts structurally parseable", () => {
    const parsed = DesignScreenPayloadSchema.parse({
      markup: "<p>Legacy</p>",
      styles: "",
      script: "document.title = 'legacy';",
      actions: [],
    });

    expect(parsed.script).toBe("document.title = 'legacy';");
  });

  it("allows a null target so an unbuilt destination is representable", () => {
    const payload = {
      markup: '<button data-meld-action="continue">Continue</button>',
      styles: "button { color: var(--meld-color-primary); }",
      script: null,
      actions: [
        {
          id: "continue",
          label: "Continue",
          targetScreenId: null,
        },
      ],
    };
    expect(DesignScreenPayloadSchema.parse(payload).actions[0].targetScreenId).toBeNull();
  });

  it("rejects duplicate action ids", () => {
    const payload = {
      markup: '<button data-meld-action="continue">Continue</button>',
      styles: "button { color: var(--meld-color-primary); }",
      script: null,
      actions: [
        {
          id: "continue",
          label: "Continue",
          targetScreenId: "9f3c1c62-0a1e-4f5e-9d2a-6b7c8d9e0f10",
        },
        {
          id: "continue",
          label: "Continue",
          targetScreenId: "9f3c1c62-0a1e-4f5e-9d2a-6b7c8d9e0f10",
        },
      ],
    };
    expect(() => DesignScreenPayloadSchema.parse(payload)).toThrow("Duplicate action id");
  });

  it("rejects markup past its byte budget", () => {
    const payload = {
      markup: "x".repeat(MAX_SCREEN_MARKUP_BYTES + 1),
      styles: "button { color: var(--meld-color-primary); }",
      script: null,
      actions: [
        {
          id: "continue",
          label: "Continue",
          targetScreenId: "9f3c1c62-0a1e-4f5e-9d2a-6b7c8d9e0f10",
        },
      ],
    };
    expect(() => DesignScreenPayloadSchema.parse(payload)).toThrow();
  });

  it("measures budgets in UTF-8 bytes, not code units", () => {
    // Four bytes each, so half the limit in characters is exactly the limit.
    const withinBudget = {
      markup: "𝄞".repeat(MAX_SCREEN_MARKUP_BYTES / 4),
      styles: "button { color: var(--meld-color-primary); }",
      script: null,
      actions: [
        {
          id: "continue",
          label: "Continue",
          targetScreenId: "9f3c1c62-0a1e-4f5e-9d2a-6b7c8d9e0f10",
        },
      ],
    };
    expect(() => DesignScreenPayloadSchema.parse(withinBudget)).not.toThrow();

    const exceedsBudget = {
      markup: "𝄞".repeat(MAX_SCREEN_MARKUP_BYTES / 4 + 1),
      styles: "button { color: var(--meld-color-primary); }",
      script: null,
      actions: [
        {
          id: "continue",
          label: "Continue",
          targetScreenId: "9f3c1c62-0a1e-4f5e-9d2a-6b7c8d9e0f10",
        },
      ],
    };
    expect(() => DesignScreenPayloadSchema.parse(exceedsBudget)).toThrow();
  });

  it("rejects more actions than the cap", () => {
    const payload = {
      markup: '<button data-meld-action="continue">Continue</button>',
      styles: "button { color: var(--meld-color-primary); }",
      script: null,
      actions: Array.from({ length: MAX_SCREEN_ACTIONS + 1 }, (_, index) => ({
        id: `action-${index}`,
        label: "Go",
        targetScreenId: null,
      })),
    };
    expect(() => DesignScreenPayloadSchema.parse(payload)).toThrow();
  });

  it("leaves headroom inside the connector result cap", () => {
    const contentBudget =
      MAX_SCREEN_MARKUP_BYTES + MAX_SCREEN_STYLES_BYTES + MAX_SCREEN_SCRIPT_BYTES;
    // Envelope, action list, and JSON escaping all ride in the same result.
    expect(contentBudget).toBeLessThanOrEqual(MAX_RESULT_BYTES * 0.7);
  });

  it("omits screenKey without failing so pre-keyed literals still parse", () => {
    const payload = {
      markup: '<button data-meld-action="continue">Continue</button>',
      styles: "",
      script: null,
      actions: [],
    };
    expect(DesignScreenPayloadSchema.parse(payload).screenKey).toBeUndefined();
  });

  it("accepts a valid screenKey slug", () => {
    const payload = {
      screenKey: "home_2",
      markup: '<button data-meld-action="continue">Continue</button>',
      styles: "",
      script: null,
      actions: [],
    };
    expect(DesignScreenPayloadSchema.parse(payload).screenKey).toBe("home_2");
  });

  it("rejects a screenKey that does not match the slug pattern", () => {
    const payload = {
      screenKey: "Home Screen!",
      markup: '<button data-meld-action="continue">Continue</button>',
      styles: "",
      script: null,
      actions: [],
    };
    expect(() => DesignScreenPayloadSchema.parse(payload)).toThrow();
  });

  it("accepts an action carrying only targetScreenKey", () => {
    const payload = {
      markup: '<button data-meld-action="continue">Continue</button>',
      styles: "",
      script: null,
      actions: [
        { id: "continue", label: "Continue", targetScreenKey: "home" },
      ],
    };
    const parsed = DesignScreenPayloadSchema.parse(payload);
    expect(parsed.actions[0].targetScreenKey).toBe("home");
    expect(parsed.actions[0].targetScreenId).toBeNull();
  });
});

describe("DesignScreenBatchSchema", () => {
  const screen = {
    screenKey: "home",
    markup: '<button data-meld-action="continue">Continue</button>',
    styles: "",
    script: null,
    actions: [],
  };

  it("accepts a batch of one or more screens", () => {
    const parsed = DesignScreenBatchSchema.parse({ screens: [screen] });
    expect(parsed.screens).toHaveLength(1);
  });

  it("rejects an empty batch", () => {
    expect(() => DesignScreenBatchSchema.parse({ screens: [] })).toThrow();
  });

  it("rejects a batch past SCREEN_BATCH_MAX", () => {
    const screens = Array.from({ length: SCREEN_BATCH_MAX + 1 }, () => screen);
    expect(() => DesignScreenBatchSchema.parse({ screens })).toThrow();
  });
});

describe("DesignScreenLayoutDirectiveSchema", () => {
  const content = {
    screenKey: "home",
    markup: "<main>x</main>",
    styles: "",
    script: null,
    actions: [],
  };

  it("accepts a reuse directive", () => {
    const r = DesignScreenLayoutDirectiveSchema.safeParse({
      reuse: { layoutKey: "app-shell" },
      create: null,
    });
    expect(r.success).toBe(true);
  });

  it("accepts a create directive with a slot", () => {
    const r = DesignScreenLayoutDirectiveSchema.safeParse({
      reuse: null,
      create: {
        layoutKey: "app-shell",
        name: null,
        shellMarkup: "<aside></aside><main data-meld-slot></main>",
        shellStyles: null,
        actions: [],
      },
    });
    expect(r.success).toBe(true);
  });

  it("rejects both reuse and create non-null", () => {
    expect(
      DesignScreenLayoutDirectiveSchema.safeParse({
        reuse: { layoutKey: "a" },
        create: {
          layoutKey: "b",
          name: null,
          shellMarkup: "<main data-meld-slot></main>",
          shellStyles: null,
          actions: [],
        },
      }).success,
    ).toBe(false);
  });

  it("rejects both null", () => {
    expect(DesignScreenLayoutDirectiveSchema.safeParse({ reuse: null, create: null }).success).toBe(
      false,
    );
  });

  it("rejects a create whose shellMarkup lacks a slot", () => {
    expect(
      DesignScreenLayoutDirectiveSchema.safeParse({
        reuse: null,
        create: { layoutKey: "a", name: null, shellMarkup: "<main></main>", shellStyles: null, actions: [] },
      }).success,
    ).toBe(false);
  });

  it("payload accepts layout: null and an absent layout (back-compat)", () => {
    expect(DesignScreenPayloadSchema.safeParse({ ...content, layout: null }).success).toBe(true);
    expect(DesignScreenPayloadSchema.safeParse(content).success).toBe(true);
  });

  it("payload accepts a layout directive", () => {
    expect(
      DesignScreenPayloadSchema.safeParse({
        ...content,
        layout: { reuse: { layoutKey: "app-shell" }, create: null },
      }).success,
    ).toBe(true);
  });

  it("degrades an invalid layout directive to null instead of failing the whole screen", () => {
    const slotless = DesignScreenPayloadSchema.safeParse({
      ...content,
      layout: {
        reuse: null,
        create: { layoutKey: "a", name: null, shellMarkup: "<main></main>", shellStyles: null, actions: [] },
      },
    });
    expect(slotless.success).toBe(true);
    expect(slotless.success && slotless.data.layout).toBeNull();

    const bothNull = DesignScreenPayloadSchema.safeParse({
      ...content,
      layout: { reuse: null, create: null },
    });
    expect(bothNull.success).toBe(true);
    expect(bothNull.success && bothNull.data.layout).toBeNull();

    // A well-formed directive still parses through intact -- .catch only
    // swallows a genuinely invalid shape.
    const wellFormed = DesignScreenPayloadSchema.safeParse({
      ...content,
      layout: { reuse: { layoutKey: "app-shell" }, create: null },
    });
    expect(wellFormed.success).toBe(true);
    expect(wellFormed.success && wellFormed.data.layout).toEqual({
      reuse: { layoutKey: "app-shell" },
      create: null,
    });
  });
});
