import { z } from "zod";
import { AITaskKindSchema, AITaskStatusSchema, ProviderSchema } from "./ai";
import { RoomProposedActionSchema } from "./rooms";

export const RoomActivityStateSchema = z.enum(["idle", "working", "needs_you"]);
export type RoomActivityState = z.infer<typeof RoomActivityStateSchema>;

export const RoomActivityReasonSchema = z.enum(["asked", "finished", "stuck"]);
export type RoomActivityReason = z.infer<typeof RoomActivityReasonSchema>;

const ProposalKindSchema = z.enum(
  RoomProposedActionSchema.options.map((option) => option.shape.kind.value) as [
    "prd_generate", "prd_revise", "user_flow_generate", "decision_capture",
  ],
);

export const RoomActivitySchema = z.object({
  roomId: z.string().uuid(),
  projectId: z.string().uuid(),
  roomName: z.string(),
  state: RoomActivityStateSchema,
  reason: RoomActivityReasonSchema.nullable(),
  taskKind: AITaskKindSchema.nullable(),
  taskStatus: AITaskStatusSchema.nullable(),
  provider: ProviderSchema.nullable(),
  proposalKind: ProposalKindSchema.nullable(),
  proposalMessageId: z.string().uuid().nullable(),
  occurredAt: z.string().nullable(),
  lastActivityAt: z.string().nullable(),
});
export type RoomActivity = z.infer<typeof RoomActivitySchema>;
