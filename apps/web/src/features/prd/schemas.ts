import { PRDDocumentSchema, ProviderSchema } from "@meld/contracts";
import { z } from "zod";

export const RoomPrdSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  version: z.number().int().min(1),
  status: z.enum(["draft", "accepted"]),
  document: PRDDocumentSchema,
  ownerId: z.string().uuid(),
  createdBy: z.string().uuid(),
  acceptedAt: z.string().nullable(),
  acceptedBy: z.string().uuid().nullable(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RoomPrd = z.infer<typeof RoomPrdSchema>;

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

export const RoomPrdInputSchema = z.object({ roomId: z.string().uuid() });
