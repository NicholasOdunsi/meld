"use server";

import type { PRDDocument, Provider } from "@meld/contracts";
import { PRDDocumentSchema, ProviderSchema } from "@meld/contracts";
import { z } from "zod";
import { getDiscoveryBackend } from "@/features/discovery/backend";
import { isDiscoveryFakeEnabled } from "@/features/discovery/e2e-gate";
import { createPrdGenerateTask } from "./create-prd-generate-task";
import {
  InvalidPrdDocumentError,
  PrdAcceptForbiddenError,
  PrdAlreadyAcceptedError,
  PrdEditForbiddenError,
  PrdVersionConflictError,
} from "./repository";
import type { RoomPrd } from "./schemas";

const GeneratePrdInputSchema = z.object({
  roomId: z.string().uuid(),
  provider: ProviderSchema.optional(),
}).strict();

export type GeneratePrdResult =
  | { status: "queued"; taskId: string }
  | { status: "error"; message: string };

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
