import { ProviderSchema } from "@meld/contracts";
import { z } from "zod";

export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

export const DiscoveryRoomInputSchema = z.object({
  organizationId: z.string().uuid(),
  name: z.string().trim().min(1).max(120),
});

export const ParticipantInputSchema = z.object({
  roomId: z.string().uuid(),
  userId: z.string().uuid(),
  access: z.enum(["view", "edit"]),
});

export const MessageInputSchema = z.object({
  roomId: z.string().uuid(),
  clientId: z.string().uuid(),
  body: z.string().trim().min(1).max(20_000),
  mentionedUserIds: z.array(z.string().uuid()).max(20),
  mentionsProductAgent: z.boolean(),
  // Per-task provider override. Absent means the room-reply task resolves the
  // caller's saved default provider; a value forces that provider for this one
  // reply. Only meaningful alongside a Product Agent mention.
  providerOverride: ProviderSchema.optional(),
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
  organizationId: z.string().uuid(),
  roomId: z.string().uuid(),
});

export type DiscoveryRoomInput = z.infer<
  typeof DiscoveryRoomInputSchema
>;
export type ParticipantInput = z.infer<typeof ParticipantInputSchema>;
export type MessageInput = z.infer<typeof MessageInputSchema>;
export type EvidenceInput = z.infer<typeof EvidenceInputSchema>;
export type DecisionInput = z.infer<typeof DecisionInputSchema>;
export type AttachmentInput = z.infer<typeof AttachmentInputSchema>;
