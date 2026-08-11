import { z } from "zod";

export const RoomStageSchema = z.enum([
  "discovery",
  "define",
  "design",
  "development",
]);

export type RoomStage = z.infer<typeof RoomStageSchema>;
