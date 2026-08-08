"use server";

import type { PRDDocument, Provider } from "@meld/contracts";
import { isPrdFieldName, PRDDocumentSchema, ProviderSchema } from "@meld/contracts";
import { z } from "zod";
import { getDiscoveryBackend } from "@/features/discovery/backend";
import { isDiscoveryFakeEnabled } from "@/features/discovery/e2e-gate";
import { createPrdGenerateTask } from "./create-prd-generate-task";
import { createPrdReviseTask } from "./create-prd-revise-task";
import { createPrdSectionReviseTask } from "./create-prd-section-revise-task";
import {
  InvalidPrdDocumentError,
  PrdAcceptForbiddenError,
  PrdAlreadyAcceptedError,
  PrdEditForbiddenError,
  PrdVersionConflictError,
} from "./repository";
import type { PrdProposal, RoomPrd } from "./schemas";

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

const ProposalInputSchema = z
  .object({ roomId: z.string().uuid(), proposalId: z.string().uuid() })
  .strict();

export type GeneratePrdResult =
  | { status: "queued"; taskId: string }
  | { status: "error"; message: string };

export type PrdSectionReviseResult = GeneratePrdResult;

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
    const task = isDiscoveryFakeEnabled()
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

export async function listPrdProposals(roomId: string): Promise<PrdProposal[]> {
  const parsed = z.string().uuid().safeParse(roomId);
  if (!parsed.success) return [];
  try {
    return await (await getDiscoveryBackend()).listRoomPrdProposals(parsed.data);
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
    const prd = await (await getDiscoveryBackend()).applyPrdProposal(parsed.data);
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
    await (await getDiscoveryBackend()).discardPrdProposal(parsed.data);
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
    const task = isDiscoveryFakeEnabled()
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
    const task = isDiscoveryFakeEnabled()
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
    const prd = await (await getDiscoveryBackend()).saveRoomPrdVersion(
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
    const prd = await (await getDiscoveryBackend()).acceptRoomPrdVersion(
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
