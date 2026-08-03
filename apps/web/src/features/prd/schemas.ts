import { PRDDocumentSchema } from "@meld/contracts";
import { z } from "zod";

export const RoomPrdSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  version: z.number().int().min(1),
  status: z.enum(["draft", "accepted"]),
  document: PRDDocumentSchema,
  ownerId: z.string().uuid(),
  // Optional while reading pre-edit PRD rows; newly persisted versions carry
  // all three metadata values, with acceptance fields set to null for drafts.
  createdBy: z.string().uuid().optional(),
  acceptedAt: z.string().nullable().optional(),
  acceptedBy: z.string().uuid().nullable().optional(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RoomPrd = z.infer<typeof RoomPrdSchema>;

export const RoomPrdInputSchema = z.object({ roomId: z.string().uuid() });
