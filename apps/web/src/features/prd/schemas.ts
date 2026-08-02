import { PRDDocumentSchema } from "@meld/contracts";
import { z } from "zod";

export const RoomPrdSchema = z.object({
  id: z.string().uuid(),
  roomId: z.string().uuid(),
  version: z.number().int().min(1),
  status: z.literal("draft"),
  document: PRDDocumentSchema,
  ownerId: z.string().uuid(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export type RoomPrd = z.infer<typeof RoomPrdSchema>;

export const RoomPrdInputSchema = z.object({ roomId: z.string().uuid() });
