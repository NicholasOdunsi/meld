import { z } from "zod";

export const RoomStageSchema = z.enum([
  "discovery",
  "define",
  "design",
  "development",
]);

export type RoomStage = z.infer<typeof RoomStageSchema>;

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
