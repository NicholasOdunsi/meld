import { z } from "zod";

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
    // Null means "not built yet" — a legal state, not a validation failure.
    targetScreenId: z.string().uuid().nullable(),
  })
  .strict();
export type DesignScreenAction = z.infer<typeof DesignScreenActionSchema>;

export const DesignScreenPayloadSchema = z
  .object({
    markup: bounded(MAX_SCREEN_MARKUP_BYTES),
    styles: bounded(MAX_SCREEN_STYLES_BYTES),
    // Kept string-compatible for already-persisted versions. New generation
    // requires null, and the safety/assembly gates reject nonempty legacy code.
    script: bounded(MAX_SCREEN_SCRIPT_BYTES).nullable(),
    actions: z.array(DesignScreenActionSchema).max(MAX_SCREEN_ACTIONS),
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
