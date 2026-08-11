import type { RoomStage } from "@meld/contracts";
import { RoomStageSchema } from "@meld/contracts";
import { Palette } from "@boxicons/react/Palette";
import { Search } from "@boxicons/react/Search";
import { Spanner } from "@boxicons/react/Spanner";
import { Target } from "@boxicons/react/Target";
import { z } from "zod";

export const ROOM_STAGE_PRESENTATION = {
  discovery: { label: "Discovery", icon: Search },
  define: { label: "Define", icon: Target },
  design: { label: "Design", icon: Palette },
  development: { label: "Development", icon: Spanner },
} as const;

export const RoomLifecycleRowSchema = z.object({
  id: z.string().uuid(),
  workspace_id: z.string().uuid(),
  project_id: z.string().uuid(),
  name: z.string(),
  owner_id: z.string().uuid(),
  stage: RoomStageSchema,
  created_at: z.string(),
  updated_at: z.string(),
});

export type RoomLifecycleRow = z.infer<typeof RoomLifecycleRowSchema>;

export function parseRoomLifecycleRow(value: unknown): RoomLifecycleRow {
  return RoomLifecycleRowSchema.parse(value);
}

export function getRoomStagePresentation(stage: RoomStage) {
  return ROOM_STAGE_PRESENTATION[stage];
}
