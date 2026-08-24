import { z } from "zod";
import { DesignProfileSchema } from "./design-profile";
import { FlowDocumentSchema } from "./user-flow";
import { StoredPRDDocumentSchema } from "./prd";
import { PrdAssistScopeSchema } from "./prd-section-assistance";
import { RoomProposedActionSchema } from "./rooms";

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

export const ModelNameSchema = z.string().trim().min(1).max(100);
export type ModelName = z.infer<typeof ModelNameSchema>;

export const AgentKindSchema = z.enum(["product", "research", "design"]);
export type AgentKind = z.infer<typeof AgentKindSchema>;

export const ResearchScopeSchema = z.enum(["room", "web"]);
export type ResearchScope = z.infer<typeof ResearchScopeSchema>;

export const MessageAuthorTypeSchema = z.enum([
  "human",
  "product_agent",
  "research_agent",
]);
export type MessageAuthorType = z.infer<typeof MessageAuthorTypeSchema>;

export const WebSourceSchema = z
  .object({
    title: z.string().trim().min(1).max(300),
    url: z
      .url()
      .max(2_000)
      .refine((value) => {
        const protocol = new URL(value).protocol;
        return protocol === "http:" || protocol === "https:";
      }, "Web sources must use HTTP or HTTPS"),
    publisher: z.string().trim().min(1).max(200).nullable().optional(),
    publishedAt: z.string().trim().min(1).max(100).nullable().optional(),
  })
  .strict();
export type WebSource = z.infer<typeof WebSourceSchema>;

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
  // Optional for compatibility with connectors released before model
  // discovery. New connectors always report this list and its default.
  models: z.array(ModelNameSchema).max(20).optional(),
  defaultModel: ModelNameSchema.optional(),
  authentication: z.enum(["authenticated", "signed_out", "unknown"]),
  compatibility: z.enum(["supported", "outdated", "unavailable"]),
});
export type ProviderStatus = z.infer<typeof ProviderStatusSchema>;

export const AITaskKindSchema = z.enum([
  "room_reply",
  "prd_generate",
  "prd_revise",
  "prd_section_revise",
  "prd_section_assist",
  "stage_readiness",
  "user_flow_generate",
  "user_flow_assist",
  "design_profile_distill",
  "design_screen_generate",
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
  workspaceId: z.string().uuid(),
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

// This mirrors the prototype action contract (packages/prototype/src/screen-payload.ts
// DesignScreenActionSchema) without introducing a dependency from contracts back to
// @meld/prototype.
const HydratedDesignScreenActionSchema = z
  .object({
    id: z
      .string()
      .trim()
      .regex(/^[a-z][a-z0-9_-]{0,63}$/),
    label: z.string().trim().min(1).max(80),
    targetScreenKey: z.string().trim().min(1).max(64).nullable().optional(),
    targetScreenId: z.string().uuid().nullable().default(null),
  })
  .strict();

export const AIContextPackageSchema = z
  .object({
    taskId: z.string().uuid(),
    initiatingUserId: z.string().uuid(),
    workspaceId: z.string().uuid(),
    roomId: z.string().uuid(),
    kind: AITaskKindSchema,
    agentKind: AgentKindSchema.default("product"),
    researchScope: ResearchScopeSchema.default("room"),
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
    designProfile: z
      .object({
        versionId: z.string().uuid(),
        profile: DesignProfileSchema,
        tokenCss: z.string(),
      })
      .strict()
      .nullable()
      .optional(),
    designScreen: z
      .object({
        screenId: z.string().uuid(),
        flowNodeId: z.string().nullable(),
        baseVersionId: z.string().uuid().nullable(),
        currentVersion: z
          .object({
            id: z.string().uuid(),
            markup: z.string(),
            styles: z.string(),
            screenKey: z
              .string()
              .trim()
              .regex(/^[a-z][a-z0-9_-]{0,63}$/)
              .optional(),
            actions: z.array(HydratedDesignScreenActionSchema),
          })
          .strict()
          .nullable(),
      })
      .strict()
      .nullable()
      .optional(),
    designSystemSource: z
      .object({
        text: z.string().max(100_000),
        fileName: z.string(),
      })
      .strict()
      .nullable()
      .optional(),
    // Present only when the room already has a PRD. Revision tasks and room
    // replies may carry the whole current document so the agent can reason from
    // either the legacy fixed sections or the freeform block format.
    existingPrd: z
      .object({
        version: z.number().int().positive(),
        title: z.string().optional(),
        document: StoredPRDDocumentSchema.optional(),
      })
      .optional(),
    // The original single-section edit context, carried by a `prd_section_revise`
    // task. Kept unchanged so a task queued before `prd_section_assist` shipped
    // still runs to completion.
    targetSection: z
      .object({
        field: z.string(),
        label: z.string(),
        quotedText: z.string().nullable(),
      })
      .optional(),
    // The frozen multi-section selection a `prd_section_assist` task asks
    // about. A task carries this or `targetSection`, never both.
    prdAssistScope: PrdAssistScopeSchema.optional(),
    // The current canvas flow a `user_flow_assist` task edits. Unlike
    // existingPrd (read from the prds table during hydration), the flow lives on
    // the tldraw canvas, so it is captured client-side, frozen on the request
    // row, and injected here by hydrate_authorized_room_context.
    existingFlow: FlowDocumentSchema.optional(),
  })
  .refine(
    (value) => value.agentKind === "research" || value.researchScope === "room",
    {
      message: "Only Research Agent tasks may use web research",
      path: ["researchScope"],
    },
  )
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
  webSources: z.array(WebSourceSchema).max(20).default([]),
  proposedAction: RoomProposedActionSchema.nullable().optional(),
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
