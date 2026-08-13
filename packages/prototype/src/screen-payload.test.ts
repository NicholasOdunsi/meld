import { MAX_RESULT_BYTES } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import {
  DesignScreenPayloadSchema,
  MAX_SCREEN_ACTIONS,
  MAX_SCREEN_MARKUP_BYTES,
  MAX_SCREEN_SCRIPT_BYTES,
  MAX_SCREEN_STYLES_BYTES,
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
});
