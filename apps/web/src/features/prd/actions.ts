"use server";

import type { PRDDocument, Provider } from "@meld/contracts";
import {
  isPrdFieldName,
  MAX_PRD_ASSIST_SECTIONS,
  MAX_PRD_ASSIST_SECTION_LABEL_CHARS,
  MAX_PRD_ASSIST_SECTION_QUOTE_CHARS,
  PRDDocumentSchema,
  PrdAssistScopeSchema,
  ModelNameSchema,
  ProviderSchema,
} from "@meld/contracts";
import { z } from "zod";
import { getRoomBackend } from "@/features/rooms/backend";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createPrdGenerateTask } from "./create-prd-generate-task";
import { createPrdReviseTask } from "./create-prd-revise-task";
import { createPrdSectionAssistTask } from "./create-prd-section-assist-task";
import { createPrdSectionReviseTask } from "./create-prd-section-revise-task";
import {
  InvalidPrdDocumentError,
  PrdAcceptForbiddenError,
  PrdAlreadyAcceptedError,
  PrdEditForbiddenError,
  PrdVersionConflictError,
} from "./repository";
import type { PrdAssistRequest, PrdProposal, RoomPrd } from "./schemas";

const GeneratePrdInputSchema = z.object({
  roomId: z.string().uuid(),
  provider: ProviderSchema.optional(),
}).strict();

const RevisePrdInputSchema = z
  .object({
    roomId: z.string().uuid(),
    sourceTaskId: z.string().uuid(),
    provider: ProviderSchema.optional(),
  })
  .strict();

const SectionReviseInputSchema = z
  .object({
    roomId: z.string().uuid(),
    field: z.string().min(1),
    sectionLabel: z.string().min(1).max(200),
    instruction: z.string().trim().min(1).max(20_000),
    quotedText: z.string().max(10_000).nullable(),
    provider: ProviderSchema.optional(),
  })
  .strict()
  .refine((value) => isPrdFieldName(value.field) && value.field !== "title", {
    message: "Invalid PRD section.",
    path: ["field"],
  });

const AssistSectionInputSchema = z
  .object({
    field: z.string().min(1),
    sectionLabel: z
      .string()
      .trim()
      .min(1)
      .max(MAX_PRD_ASSIST_SECTION_LABEL_CHARS),
    quotedText: z.string().min(1).max(MAX_PRD_ASSIST_SECTION_QUOTE_CHARS),
  })
  .strict();

const AssistPrdSectionInputSchema = z
  .object({
    roomId: z.string().uuid(),
    // The idempotency key. A resubmission of the same composer submission
    // returns the first one's ids rather than queueing a second task.
    clientRequestId: z.string().uuid(),
    sections: z
      .array(AssistSectionInputSchema)
      .min(1)
      .max(MAX_PRD_ASSIST_SECTIONS),
    instruction: z.string().trim().min(1).max(20_000),
    provider: ProviderSchema.optional(),
    model: ModelNameSchema.optional(),
  })
  .strict();

const ProposalInputSchema = z
  .object({ roomId: z.string().uuid(), proposalId: z.string().uuid() })
  .strict();

const AssistRequestInputSchema = z
  .object({ roomId: z.string().uuid(), requestId: z.string().uuid() })
  .strict();

export type GeneratePrdResult =
  | { status: "queued"; taskId: string }
  | { status: "error"; message: string };

export type PrdSectionReviseResult = GeneratePrdResult;

// Compatibility only. New submissions go through assistPrdSection; this stays
// callable so a proposal queued through the old edit-only path can still be
// re-run while in-flight prd_section_revise tasks drain. Task 8 removes it.
export async function revisePrdSection(input: {
  roomId: string;
  field: string;
  sectionLabel: string;
  instruction: string;
  quotedText: string | null;
  provider?: Provider;
}): Promise<PrdSectionReviseResult> {
  const parsed = SectionReviseInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  try {
    const task = isRoomFakeEnabled()
      ? await (await import("./e2e-fake")).fakeQueuePrdSectionRevision(parsed.data)
      : await createPrdSectionReviseTask(parsed.data);
    return { status: "queued", taskId: task.id };
  } catch {
    return {
      status: "error",
      message: "Could not start the PRD section revision.",
    };
  }
}

export type PrdAssistResult =
  | { status: "queued"; taskId: string; requestId: string }
  | { status: "error"; message: string };

// One natural-language request against one or more selected PRD sections. The
// user is never asked whether this is a question or an edit: the Product Agent
// decides, and nothing here inspects the instruction to guess. What this action
// does decide is whether the submission is well formed, and it does so before
// the RPC is reached.
export async function assistPrdSection(input: {
  roomId: string;
  clientRequestId: string;
  sections: Array<{
    field: string;
    sectionLabel: string;
    quotedText: string;
  }>;
  instruction: string;
  provider?: Provider;
  model?: string;
}): Promise<PrdAssistResult> {
  const parsed = AssistPrdSectionInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Invalid request." };

  // The scope rules -- unique non-title fields in rendered document order, the
  // per-fragment cap and the total-selection cap -- belong to the contract, so
  // the selection is checked by parsing it through the contract rather than by
  // restating them. `canProposeEdit` is not the client's to assert: the RPC
  // computes it from room access, and the value given here only satisfies the
  // schema's shape before being discarded.
  const scope = PrdAssistScopeSchema.safeParse({
    sections: parsed.data.sections.map((section) => ({
      field: section.field,
      label: section.sectionLabel,
      quotedText: section.quotedText,
    })),
    canProposeEdit: false,
  });
  if (!scope.success) return { status: "error", message: "Invalid request." };

  const request = {
    roomId: parsed.data.roomId,
    clientRequestId: parsed.data.clientRequestId,
    sections: scope.data.sections,
    instruction: parsed.data.instruction,
    provider: parsed.data.provider,
    ...(parsed.data.model ? { model: parsed.data.model } : {}),
  };

  try {
    const queued = isRoomFakeEnabled()
      ? await (await import("./e2e-fake")).fakeAssistPrdSection(request)
      : await createPrdSectionAssistTask(request);
    return {
      status: "queued",
      taskId: queued.taskId,
      requestId: queued.requestId,
    };
  } catch {
    return {
      status: "error",
      message: "Could not send this to the Product Agent.",
    };
  }
}

export async function getPrdAssistRequest(input: {
  roomId: string;
  requestId: string;
}): Promise<PrdAssistRequest | null> {
  const parsed = AssistRequestInputSchema.safeParse(input);
  if (!parsed.success) return null;
  try {
    return await (await getRoomBackend()).getPrdAssistRequest(parsed.data);
  } catch {
    return null;
  }
}

// Recovery after a refresh: the requests this reader has in flight or has not
// looked at yet, so a page reload does not lose one.
export async function listPrdAssistRequests(
  roomId: string,
): Promise<PrdAssistRequest[]> {
  const parsed = z.string().uuid().safeParse(roomId);
  if (!parsed.success) return [];
  try {
    return await (await getRoomBackend()).listRoomPrdAssistRequests({
      roomId: parsed.data,
    });
  } catch {
    return [];
  }
}

// Closing a settled request. The reader's own recovery list is what this
// affects, so a failure is nothing to interrupt them with: the notice they
// just closed is already gone from the screen, and it will simply come back on
// the next refresh if the write did not land.
export async function dismissPrdAssistRequest(input: {
  roomId: string;
  requestId: string;
}): Promise<void> {
  const parsed = AssistRequestInputSchema.safeParse(input);
  if (!parsed.success) return;
  try {
    await (await getRoomBackend()).dismissPrdAssistRequest(parsed.data);
  } catch {
    // Intentionally silent -- see above.
  }
}

export async function listPrdProposals(roomId: string): Promise<PrdProposal[]> {
  const parsed = z.string().uuid().safeParse(roomId);
  if (!parsed.success) return [];
  try {
    return await (await getRoomBackend()).listRoomPrdProposals(parsed.data);
  } catch {
    return [];
  }
}

export type ApplyPrdProposalResult =
  | { status: "applied"; prd: RoomPrd }
  | { status: "error"; message: string };

export async function applyPrdProposal(input: {
  roomId: string;
  proposalId: string;
}): Promise<ApplyPrdProposalResult> {
  const parsed = ProposalInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  try {
    const prd = await (await getRoomBackend()).applyPrdProposal(parsed.data);
    return { status: "applied", prd };
  } catch {
    return {
      status: "error",
      message: "Could not apply the PRD proposal. The document may have changed.",
    };
  }
}

export async function discardPrdProposal(input: {
  roomId: string;
  proposalId: string;
}): Promise<{ status: "discarded" } | { status: "error"; message: string }> {
  const parsed = ProposalInputSchema.safeParse(input);
  if (!parsed.success) return { status: "error", message: "Invalid request." };
  try {
    await (await getRoomBackend()).discardPrdProposal(parsed.data);
    return { status: "discarded" };
  } catch {
    return { status: "error", message: "Could not discard the PRD proposal." };
  }
}

const SavePrdVersionInputSchema = z
  .object({
    roomId: z.string().uuid(),
    baseVersion: z.number().int().positive(),
    document: PRDDocumentSchema,
  })
  .strict();

const AcceptPrdVersionInputSchema = z
  .object({
    roomId: z.string().uuid(),
    prdId: z.string().uuid(),
  })
  .strict();

export type SavePrdResult =
  | { status: "saved"; prd: RoomPrd }
  | { status: "conflict"; currentVersion: number }
  | { status: "error"; message: string };

export type AcceptPrdResult =
  | { status: "accepted"; prd: RoomPrd }
  | { status: "error"; message: string };

export async function generatePrd(input: {
  roomId: string;
  provider?: Provider;
}): Promise<GeneratePrdResult> {
  const parsed = GeneratePrdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid request." };
  }

  try {
    const task = isRoomFakeEnabled()
      ? await (await import("./e2e-fake")).fakeGeneratePrd(parsed.data)
      : await createPrdGenerateTask(parsed.data);
    return { status: "queued", taskId: task.id };
  } catch {
    return {
      status: "error",
      message: "Could not start PRD generation.",
    };
  }
}

export async function revisePrd(input: {
  roomId: string;
  sourceTaskId: string;
  provider?: Provider;
}): Promise<GeneratePrdResult> {
  const parsed = RevisePrdInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid request." };
  }

  try {
    const task = isRoomFakeEnabled()
      ? await (await import("./e2e-fake")).fakeRevisePrd(parsed.data)
      : await createPrdReviseTask(parsed.data);
    return { status: "queued", taskId: task.id };
  } catch {
    return {
      status: "error",
      message: "Could not start PRD revision.",
    };
  }
}

export async function savePrdVersion(input: {
  roomId: string;
  baseVersion: number;
  document: PRDDocument;
}): Promise<SavePrdResult> {
  const parsed = SavePrdVersionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid request." };
  }

  try {
    const prd = await (await getRoomBackend()).saveRoomPrdVersion(
      parsed.data,
    );
    return { status: "saved", prd };
  } catch (error) {
    if (error instanceof PrdVersionConflictError) {
      return { status: "conflict", currentVersion: error.currentVersion };
    }
    if (error instanceof PrdEditForbiddenError) {
      return {
        status: "error",
        message: "You do not have permission to edit this PRD.",
      };
    }
    if (error instanceof InvalidPrdDocumentError) {
      return { status: "error", message: "The PRD document is invalid." };
    }
    return { status: "error", message: "Could not save the PRD version." };
  }
}

export async function acceptPrdVersion(input: {
  roomId: string;
  prdId: string;
}): Promise<AcceptPrdResult> {
  const parsed = AcceptPrdVersionInputSchema.safeParse(input);
  if (!parsed.success) {
    return { status: "error", message: "Invalid request." };
  }

  try {
    const prd = await (await getRoomBackend()).acceptRoomPrdVersion(
      parsed.data,
    );
    return { status: "accepted", prd };
  } catch (error) {
    if (error instanceof PrdAcceptForbiddenError) {
      return {
        status: "error",
        message: "You do not have permission to accept this PRD.",
      };
    }
    if (error instanceof PrdAlreadyAcceptedError) {
      return {
        status: "error",
        message: "This PRD version cannot be accepted.",
      };
    }
    return { status: "error", message: "Could not accept the PRD version." };
  }
}
