import { z } from "zod";
import { FORM_FACTORS } from "./form-factor";

// 96 + 32 + 32 = 160 KiB of content, comfortably inside the connector's
// 256 KiB MAX_RESULT_BYTES once the JSON envelope and action list are added.
export const MAX_SCREEN_MARKUP_BYTES = 96 * 1024;
export const MAX_SCREEN_STYLES_BYTES = 32 * 1024;
export const MAX_SCREEN_SCRIPT_BYTES = 32 * 1024;
export const MAX_SCREEN_ACTIONS = 40;

const encoder = new TextEncoder();

// Budgets are in bytes because that is what the transport caps, and a string's
// length is not its size once the model emits an emoji or a curly quote.
function byteLength(value: string): number {
  return encoder.encode(value).length;
}

function bounded(limit: number) {
  return z.string().refine((value) => byteLength(value) <= limit, {
    message: `exceeds ${limit} bytes`,
  });
}

export const DesignScreenActionSchema = z
  .object({
    // Stable and opaque: markup references it as data-meld-action, so it must
    // survive a screen rename.
    id: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/),
    label: z.string().trim().min(1).max(80),
    // The other screen's `screenKey` this control navigates to. Symbolic --
    // the generator never has to know a sibling screen's UUID, and forward
    // references (linking to a screen that doesn't exist yet) heal once that
    // screen materializes. The read path resolves it to a screen id.
    targetScreenKey: z.string().trim().min(1).max(64).nullable().optional(),
    // The resolved target screen, or null for "not linked yet" -- a legal state,
    // not a validation failure. Filled by the reader's resolution pass (key
    // resolution against `targetScreenKey`); also how legacy rows expressed a
    // link directly.
    targetScreenId: z.string().uuid().nullable().default(null),
  })
  .strict();
export type DesignScreenAction = z.infer<typeof DesignScreenActionSchema>;

const LayoutSlug = z.string().trim().regex(/^[a-z][a-z0-9_-]{0,63}$/);

// A screen either reuses an already-materialized shared layout by key, or
// declares a brand-new shell for the materializer to create -- never both,
// never neither. The wire shape mirrors the materializer
// (supabase/migrations/202608150013_materialize_layouts.sql:196-259) exactly;
// field names here are load-bearing, not cosmetic.
export const DesignScreenLayoutDirectiveSchema = z
  .object({
    reuse: z.object({ layoutKey: LayoutSlug }).strict().nullable(),
    create: z
      .object({
        layoutKey: LayoutSlug,
        name: z.string().trim().min(1).max(120).nullable(),
        // Must carry a slot or the shell can never wrap content (matches the
        // materializer's data-meld-slot gate); the renderer's injectSlot is
        // the stricter exactly-one-empty-slot check at compose time.
        shellMarkup: bounded(MAX_SCREEN_MARKUP_BYTES).refine((m) => m.includes("data-meld-slot"), {
          message: "shellMarkup must contain a data-meld-slot element",
        }),
        shellStyles: bounded(MAX_SCREEN_STYLES_BYTES).nullable(),
        actions: z.array(DesignScreenActionSchema).max(MAX_SCREEN_ACTIONS),
      })
      .strict()
      .nullable(),
  })
  .strict()
  .refine((d) => (d.reuse === null) !== (d.create === null), {
    message: "exactly one of reuse/create must be set",
  });
export type DesignScreenLayoutDirective = z.infer<typeof DesignScreenLayoutDirectiveSchema>;

export const DesignScreenPayloadSchema = z
  .object({
    // The screen naming itself, so other screens' actions can target it by
    // key. Optional so already-persisted payloads and hand-written literals
    // (e2e fakes, tests) that predate keyed linking still parse; the
    // model-facing requirement (every generated screen must have one) is
    // enforced by the connector's response schema, not here.
    screenKey: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/)
      .optional(),
    // The device form factor this screen is designed for, so the canvas frame is
    // created at the right size. Optional -- absent falls back to the default
    // form factor at read time.
    formFactor: z.enum(FORM_FACTORS).optional(),
    markup: bounded(MAX_SCREEN_MARKUP_BYTES),
    styles: bounded(MAX_SCREEN_STYLES_BYTES),
    // Kept string-compatible for already-persisted versions. New generation
    // requires null, and the safety/assembly gates reject nonempty legacy code.
    script: bounded(MAX_SCREEN_SCRIPT_BYTES).nullable(),
    actions: z.array(DesignScreenActionSchema).max(MAX_SCREEN_ACTIONS),
    // Which shared shell this screen belongs to, or null/absent for a
    // standalone screen. Absent so already-persisted payloads (predating
    // shared layouts) still parse; see DesignScreenLayoutDirectiveSchema.
    layout: DesignScreenLayoutDirectiveSchema.nullable().optional(),
  })
  .strict()
  .superRefine((payload, ctx) => {
    const seen = new Set<string>();
    for (const [index, action] of payload.actions.entries()) {
      if (seen.has(action.id)) {
        ctx.addIssue({
          code: "custom",
          message: `Duplicate action id: ${action.id}`,
          path: ["actions", index, "id"],
        });
      }
      seen.add(action.id);
    }
  });
export type DesignScreenPayload = z.infer<typeof DesignScreenPayloadSchema>;

// A generation call returns 1..N screens (a login screen -> 1; "the onboarding
// flow" -> several), each wiring up to the others by `targetScreenKey`. Capped
// so a batch stays within the connector's result-size limit alongside the
// JSON envelope.
export const SCREEN_BATCH_MAX = 12;

export const DesignScreenBatchSchema = z.object({
  screens: z.array(DesignScreenPayloadSchema).min(1).max(SCREEN_BATCH_MAX),
});
export type DesignScreenBatch = z.infer<typeof DesignScreenBatchSchema>;
