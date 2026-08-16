import { z } from "zod";

export const RoomStageSchema = z.enum([
  "discovery",
  "define",
  "design",
  "development",
]);

export type RoomStage = z.infer<typeof RoomStageSchema>;

// Checklist items a person confirms by hand (nothing in the room can prove
// them). Auto items are derived from room signals instead and never persisted
// here, so this list is deliberately small.
export const ManualChecklistItemKeySchema = z.enum([
  "problem_framed",
  "design_reviewed",
]);

export type ManualChecklistItemKey = z.infer<
  typeof ManualChecklistItemKeySchema
>;

export const RoomChecklistCheckSchema = z
  .object({
    itemKey: ManualChecklistItemKeySchema,
    checkedBy: z.string().uuid(),
    checkedAt: z.string(),
  })
  .strict();

export type RoomChecklistCheck = z.infer<typeof RoomChecklistCheckSchema>;

export const RoomProposedActionSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("prd_generate") }).strict(),
  z.object({ kind: z.literal("prd_revise") }).strict(),
  z.object({ kind: z.literal("user_flow_generate") }).strict(),
  z
    .object({
      kind: z.literal("decision_capture"),
      summary: z.string().trim().min(1).max(5_000),
      sourceMessageId: z.string().uuid().nullable(),
    })
    .strict(),
]);

export type RoomProposedAction = z.infer<
  typeof RoomProposedActionSchema
>;
