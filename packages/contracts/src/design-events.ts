import { z } from "zod";

// The unified history feed's event kinds. Order is load-bearing: the SQL
// `design_event_kind` enum and the enum-parity check assert this exact list.
export const DesignScreenEventKindSchema = z.enum([
  "message",
  "generation_started",
  "version_created",
  "version_promoted",
  "generation_failed",
  "restored",
  "stale_candidate",
]);
export type DesignScreenEventKind = z.infer<
  typeof DesignScreenEventKindSchema
>;

export const DesignScreenEventSchema = z
  .object({
    id: z.string().uuid(),
    roomId: z.string().uuid(),
    screenId: z.string().uuid().nullable(),
    kind: DesignScreenEventKindSchema,
    messageId: z.string().uuid().nullable(),
    taskId: z.string().uuid().nullable(),
    versionId: z.string().uuid().nullable(),
    actor: z.string().uuid().nullable(),
    createdAt: z.string().datetime({ offset: true }),
  })
  .strict();
export type DesignScreenEvent = z.infer<typeof DesignScreenEventSchema>;
