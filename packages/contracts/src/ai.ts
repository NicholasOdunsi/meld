import { z } from "zod";

export const ProviderSchema = z.enum(["codex", "claude"]);
export type Provider = z.infer<typeof ProviderSchema>;

export const ProviderStatusSchema = z.object({
  provider: ProviderSchema,
  installation: z.enum([
    "not_installed",
    "installing",
    "installed",
    "update_required",
    "failed",
  ]),
  version: z.string().nullable(),
  authentication: z.enum(["authenticated", "signed_out", "unknown"]),
  compatibility: z.enum(["supported", "outdated", "unavailable"]),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const AITaskKindSchema = z.enum([
  "room_reply",
  "prd_generate",
  "prd_revise",
  "stage_readiness",
]);
export type AITaskKind = z.infer<typeof AITaskKindSchema>;

export const AITaskStatusSchema = z.enum([
  "queued",
  "waiting_for_device",
  "ready_to_run",
  "running",
  "needs_reauthentication",
  "usage_limit_reached",
  "needs_review",
  "completed",
  "cancelled",
  "failed",
]);
export type AITaskStatus = z.infer<typeof AITaskStatusSchema>;

export const AITaskSchema = z.object({
  id: z.string().uuid(),
  initiatingUserId: z.string().uuid(),
  organizationId: z.string().uuid(),
  roomId: z.string().uuid(),
  deviceId: z.string().uuid(),
  provider: ProviderSchema,
  kind: AITaskKindSchema,
  status: AITaskStatusSchema,
  contextRevision: z.number().int().nonnegative(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type AITask = z.infer<typeof AITaskSchema>;

export const AIContextPackageSchema = z.object({
  taskId: z.string().uuid(),
  initiatingUserId: z.string().uuid(),
  organizationId: z.string().uuid(),
  roomId: z.string().uuid(),
  kind: AITaskKindSchema,
  instruction: z.string().min(1).max(20_000),
  messages: z.array(
    z.object({
      id: z.string().uuid(),
      authorName: z.string(),
      text: z.string(),
      createdAt: z.string().datetime(),
    }),
  ),
  attachments: z.array(
    z.object({
      id: z.string().uuid(),
      name: z.string(),
      mimeType: z.string(),
      extractedText: z.string().max(100_000).nullable(),
      userCaption: z.string().max(2_000).nullable(),
    }),
  ),
  currentPrd: z.unknown().nullable(),
});
export type AIContextPackage = z.infer<typeof AIContextPackageSchema>;
