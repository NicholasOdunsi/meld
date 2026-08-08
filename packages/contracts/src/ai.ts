import { z } from "zod";
import { PRDDocumentSchema } from "./prd";

export const MAX_INSTRUCTION_CHARS = 20_000;
export const MAX_MANIFEST_MESSAGES = 500;
export const MAX_MANIFEST_ATTACHMENTS = 50;
export const MAX_MANIFEST_EVIDENCE = 100;
export const MAX_MANIFEST_DECISIONS = 100;
export const MAX_HYDRATED_CONTEXT_BYTES = 512 * 1024;
export const MAX_RESULT_BYTES = 256 * 1024;

export const AIInstructionSchema = z
  .string()
  .trim()
  .min(1)
  .max(MAX_INSTRUCTION_CHARS);
export type AIInstruction = z.infer<typeof AIInstructionSchema>;

const jsonBytes = (value: unknown) => {
  const serialized = JSON.stringify(value);
  return serialized === undefined
    ? Number.POSITIVE_INFINITY
    : new TextEncoder().encode(serialized).byteLength;
};

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
  "prd_section_revise",
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

export const AIContextManifestSchema = z.object({
  messageIds: z.array(z.string().uuid()).max(MAX_MANIFEST_MESSAGES),
  attachmentIds: z.array(z.string().uuid()).max(MAX_MANIFEST_ATTACHMENTS),
  evidenceIds: z.array(z.string().uuid()).max(MAX_MANIFEST_EVIDENCE),
  decisionIds: z.array(z.string().uuid()).max(MAX_MANIFEST_DECISIONS),
});
export type AIContextManifest = z.infer<typeof AIContextManifestSchema>;

export const EvidenceContextSchema = z.object({
  id: z.string().uuid(),
  title: z.string().max(200),
  note: z.string().max(10_000).nullable(),
});
export type EvidenceContext = z.infer<typeof EvidenceContextSchema>;

export const DecisionContextSchema = z.object({
  id: z.string().uuid(),
  summary: z.string().max(5_000),
  sourceMessageId: z.string().uuid().nullable(),
});
export type DecisionContext = z.infer<typeof DecisionContextSchema>;

export const AIContextPackageSchema = z
  .object({
    taskId: z.string().uuid(),
    initiatingUserId: z.string().uuid(),
    organizationId: z.string().uuid(),
    roomId: z.string().uuid(),
    kind: AITaskKindSchema,
    instruction: AIInstructionSchema,
    messages: z
      .array(
        z.object({
          id: z.string().uuid(),
          authorName: z.string(),
          text: z.string(),
          createdAt: z.string().datetime(),
        }),
      )
      .max(MAX_MANIFEST_MESSAGES),
    attachments: z
      .array(
        z.object({
          id: z.string().uuid(),
          name: z.string(),
          mimeType: z.string(),
          extractedText: z.string().max(100_000).nullable(),
          userCaption: z.string().max(2_000).nullable(),
        }),
      )
      .max(MAX_MANIFEST_ATTACHMENTS),
    evidence: z.array(EvidenceContextSchema).max(MAX_MANIFEST_EVIDENCE),
    decisions: z.array(DecisionContextSchema).max(MAX_MANIFEST_DECISIONS),
    // Present only when the room already has a PRD. A prd_revise task carries the
    // whole document to edit; a room_reply carries a title-only summary (no
    // `document`) so the agent knows a PRD exists and can offer to revise it.
    existingPrd: z
      .object({
        version: z.number().int().positive(),
        title: z.string().optional(),
        document: PRDDocumentSchema.optional(),
      })
      .optional(),
    targetSection: z
      .object({
        field: z.string(),
        label: z.string(),
        quotedText: z.string().nullable(),
      })
      .optional(),
  })
  .refine((value) => jsonBytes(value) <= MAX_HYDRATED_CONTEXT_BYTES, {
    message: "Hydrated AI context exceeds the maximum serialized size",
  });
export type AIContextPackage = z.infer<typeof AIContextPackageSchema>;

// `response` is the only field a model must actually produce. The four list
// fields default to empty because a model told to "leave them empty when they
// don't apply" reliably reads that as "omit them", and losing an otherwise
// perfect reply over an absent `[]` is the worst possible trade. Defaulting
// keeps the parsed result's shape identical for every consumer -- the arrays are
// always present downstream -- while making omission legal on the way in.
export const RoomReplyResultSchema = z.object({
  response: z.string().trim().min(1).max(20_000),
  citedMessageIds: z.array(z.string().uuid()).max(100).default([]),
  citedEvidenceIds: z.array(z.string().uuid()).max(100).default([]),
  assumptions: z
    .array(z.string().trim().min(1).max(2_000))
    .max(20)
    .default([]),
  suggestedNextQuestions: z
    .array(z.string().trim().min(1).max(2_000))
    .max(5)
    .default([]),
  proposedAction: z
    .object({ kind: z.enum(["prd_generate", "prd_revise"]) })
    .strict()
    .nullable()
    .optional(),
});
export type RoomReplyResult = z.infer<typeof RoomReplyResultSchema>;

export const ProviderSetupStatusSchema = z.enum([
  "queued",
  "dispatched",
  "installing",
  "authenticating",
  "verifying",
  "completed",
  "failed",
  "cancelled",
]);
export type ProviderSetupStatus = z.infer<
  typeof ProviderSetupStatusSchema
>;

export const ProviderSetupStageSchema = z.enum([
  "installing",
  "authenticating",
  "verifying",
]);
export type ProviderSetupStage = z.infer<
  typeof ProviderSetupStageSchema
>;

export const ProviderSetupErrorCodeSchema = z.enum([
  "runtime_install_failed",
  "provider_install_failed",
  "authentication_failed",
  "verification_failed",
  "unsupported_platform",
  "cancelled",
  "unknown",
]);
export type ProviderSetupErrorCode = z.infer<
  typeof ProviderSetupErrorCodeSchema
>;
