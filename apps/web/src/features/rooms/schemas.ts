import {
  AgentKindSchema,
  ProviderSchema,
  ModelNameSchema,
  ResearchScopeSchema,
  RoomStageSchema,
} from "@meld/contracts";
import { z } from "zod";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const RoomInputSchema = z.object({
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

export const ParticipantInputSchema = z.object({
  roomId: z.string().uuid(),
  userId: z.string().uuid(),
  access: z.enum(["view", "edit"]),
});

export const RoomParticipantSelectionSchema =
  ParticipantInputSchema.omit({ roomId: true });

export const RemoveParticipantInputSchema =
  ParticipantInputSchema.pick({ roomId: true, userId: true });

export const MessageInputSchema = z.object({
  roomId: z.string().uuid(),
  clientId: z.string().uuid(),
  // Empty is allowed at the schema level so an attachment can be sent with no
  // text; postMessage still rejects a message that has neither body nor
  // attachment. Kept a plain object (no .refine) because callers read
  // MessageInputSchema.shape.
  body: z.string().trim().max(20_000),
  mentionedUserIds: z.array(z.string().uuid()).max(20),
  mentionsProductAgent: z.boolean(),
  agentKind: AgentKindSchema.optional(),
  researchScope: ResearchScopeSchema.optional(),
  // Per-task provider override. Absent means the room-reply task resolves the
  // caller's saved default provider; a value forces that provider for this one
  // reply. Only meaningful alongside a Product Agent mention.
  providerOverride: ProviderSchema.optional(),
  modelOverride: ModelNameSchema.optional(),
  // Ids of already-staged attachments to link to this message. Linked before
  // the reply task is created so the frozen context manifest includes them.
  attachmentIds: z.array(z.string().uuid()).max(10).optional(),
});

export const EvidenceInputSchema = z
  .object({
    roomId: z.string().uuid(),
    messageId: z.string().uuid().optional(),
    attachmentId: z.string().uuid().optional(),
    title: z.string().trim().min(1).max(200),
    note: z.string().trim().min(1).max(10_000).optional(),
  })
  .refine(
    (value) => value.messageId || value.attachmentId || value.note,
    "Evidence requires a message, attachment, or note.",
  );

export const DecisionInputSchema = z.object({
  roomId: z.string().uuid(),
  sourceMessageId: z.string().uuid().optional(),
  summary: z.string().trim().min(1).max(5_000),
});

const AllowedMimeTypeSchema = z.enum([
  "text/plain",
  "text/markdown",
  "text/html",
  "text/csv",
  "text/tab-separated-values",
  "text/yaml",
  "application/yaml",
  "application/json",
  "application/xml",
  "text/xml",
  "application/pdf",
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif",
  "image/svg+xml",
]);

export const AttachmentInputSchema = z
  .object({
    roomId: z.string().uuid(),
    messageId: z.string().uuid().optional(),
    fileName: z.string().trim().min(1).max(255),
    mimeType: AllowedMimeTypeSchema,
    size: z.number().int().positive().max(MAX_ATTACHMENT_BYTES),
    caption: z.string().trim().min(1).max(2_000).optional(),
  })
  .refine(
    (value) =>
      !value.mimeType.startsWith("image/") || Boolean(value.caption),
    {
      message: "Images require a caption for textual context.",
      path: ["caption"],
    },
  );

export const StagedAttachmentLinkInputSchema = z.object({
  roomId: z.string().uuid(),
  messageId: z.string().uuid(),
  attachmentIds: z.array(z.string().uuid()).min(1).max(10),
  caption: z.string().trim().min(1).max(2_000),
});

export const StagedAttachmentDiscardInputSchema = z.object({
  roomId: z.string().uuid(),
  attachmentId: z.string().uuid(),
});

export const DeleteRoomInputSchema = z.object({
  workspaceId: z.string().uuid(),
  roomId: z.string().uuid(),
});

export const SetRoomStageInputSchema = z.object({
  roomId: z.string().uuid(),
  stage: RoomStageSchema,
});

export const MoveRoomInputSchema = z.object({
  workspaceId: z.string().uuid(),
  roomId: z.string().uuid(),
  projectId: z.string().uuid(),
});

export const RoomLifecycleSnapshotInputSchema = z.union([
  z.object({ roomId: z.string().uuid() }).strict(),
  z.object({ workspaceId: z.string().uuid() }).strict(),
]);

export const RoomLifecycleRowSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  project_id: z.string().uuid(),
  name: z.string(),
  owner_id: z.string().uuid(),
  stage: RoomStageSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export const RoomLifecycleSnapshotSchema = z.object({
  id: z.string().uuid(),
  workspaceId: z.string().uuid(),
  projectId: z.string().uuid(),
  name: z.string(),
  ownerId: z.string().uuid(),
  stage: RoomStageSchema,
  updatedAt: z.string(),
});

export type RoomInput = z.infer<
  typeof RoomInputSchema
>;
export type ParticipantInput = z.infer<typeof ParticipantInputSchema>;
export type RoomParticipantSelection = z.infer<
  typeof RoomParticipantSelectionSchema
>;
export type RemoveParticipantInput = z.infer<
  typeof RemoveParticipantInputSchema
>;
export type MessageInput = z.infer<typeof MessageInputSchema>;
export type EvidenceInput = z.infer<typeof EvidenceInputSchema>;
export type DecisionInput = z.infer<typeof DecisionInputSchema>;
export type AttachmentInput = z.infer<typeof AttachmentInputSchema>;
export type SetRoomStageInput = z.infer<typeof SetRoomStageInputSchema>;
export type MoveRoomInput = z.infer<typeof MoveRoomInputSchema>;
export type RoomLifecycleSnapshot = z.infer<
  typeof RoomLifecycleSnapshotSchema
>;
