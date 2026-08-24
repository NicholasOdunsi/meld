import {
  AITaskStatusSchema,
  MAX_PRD_ASSIST_SECTIONS,
  StoredPRDDocumentSchema,
  type PRDDocument,
  PrdAssistScopeSectionSchema,
  ProviderSchema,
  TaskErrorCodeSchema,
} from "@meld/contracts";
import { z } from "zod";

export const RoomPrdSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  version: z.number().int().min(1),
  status: z.enum(["draft", "accepted"]),
  document: StoredPRDDocumentSchema,
  ownerId: z.string().uuid(),
  createdBy: z.string().uuid(),
  acceptedAt: z.string().nullable(),
  acceptedBy: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

type StoredRoomPrd = z.infer<typeof RoomPrdSchema>;

// Legacy components are kept strongly typed while PrdDocument's runtime
// wrapper routes blocks-v1 records to the freeform surface before they reach
// those components.
export type RoomPrd = Omit<StoredRoomPrd, "document"> & {
  document: PRDDocument;
};

export const PrdProposalSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  taskId: z.string().uuid(),
  provider: ProviderSchema,
  basePrdId: z.string().uuid(),
  baseVersion: z.number().int().positive(),
  sectionField: z.string().min(1),
  sectionLabel: z.string().min(1),
  instruction: z.string().min(1),
  quotedText: z.string().nullable(),
  previousValue: z.unknown(),
  proposedValue: z.unknown().nullable(),
  status: z.enum(["pending", "ready", "applied", "discarded", "failed"]),
  errorMessage: z.string().nullable(),
  createdBy: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  appliedAt: z.string().nullable(),
  discardedAt: z.string().nullable(),
});

export type PrdProposal = z.infer<typeof PrdProposalSchema>;

// One composer submission, read back after the model settled it. Everything
// here is persisted: the frozen context the question was asked against, and
// whichever of the four outcomes came back. `taskStatus` and `provider` come
// from the request's own ai_tasks row -- the task status because a retried run
// leaves the request row reading 'failed' until the new run settles (see
// prd-assist-outcome.ts), and the provider because a failure offers recovery
// on an alternate one.
//
// `selected_values` is deliberately not mapped: the frozen previous value the
// review surface needs already travels on the proposal, and the column can be
// a whole PRD's worth of content on every poll.
export const PrdAssistRequestSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  taskId: z.string().uuid(),
  clientRequestId: z.string().uuid(),
  basePrdId: z.string().uuid(),
  baseVersion: z.number().int().positive(),
  selectedSections: z
    .array(PrdAssistScopeSectionSchema)
    .min(1)
    .max(MAX_PRD_ASSIST_SECTIONS),
  instruction: z.string().min(1),
  canProposeEdit: z.boolean(),
  status: z.enum(["pending", "ready", "failed", "dismissed"]),
  answer: z.string().nullable(),
  clarifyingQuestion: z.string().nullable(),
  citedMessageIds: z.array(z.string().uuid()),
  citedEvidenceIds: z.array(z.string().uuid()),
  assumptions: z.array(z.string()),
  suggestedNextQuestions: z.array(z.string()),
  proposalId: z.string().uuid().nullable(),
  // Why the edit half could not be materialized. A closed, public-safe set.
  proposalErrorCode: z
    .enum(["section_has_active_proposal", "edit_not_permitted"])
    .nullable(),
  errorCode: TaskErrorCodeSchema.nullable(),
  questionMessageId: z.string().uuid().nullable(),
  answerMessageId: z.string().uuid().nullable(),
  provider: ProviderSchema,
  taskStatus: AITaskStatusSchema,
  createdBy: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
  settledAt: z.string().nullable(),
});

export type PrdAssistRequest = z.infer<typeof PrdAssistRequestSchema>;

export const RoomPrdInputSchema = z.object({ roomId: z.string().uuid() });
