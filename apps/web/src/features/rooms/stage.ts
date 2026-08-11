import type { RoomStage } from "@meld/contracts";
import { Palette } from "@boxicons/react/Palette";
import { Search } from "@boxicons/react/Search";
import { Spanner } from "@boxicons/react/Spanner";
import { Target } from "@boxicons/react/Target";
import { z } from "zod";
import { RoomLifecycleRowSchema } from "./schemas";

export const ROOM_STAGE_PRESENTATION = {
  discovery: { label: "Discovery", icon: Search },
  define: { label: "Define", icon: Target },
  design: { label: "Design", icon: Palette },
  development: { label: "Development", icon: Spanner },
} as const;

export { RoomLifecycleRowSchema };

export type RoomLifecycleRow = z.infer<typeof RoomLifecycleRowSchema>;

export function parseRoomLifecycleRow(value: unknown): RoomLifecycleRow {
  return RoomLifecycleRowSchema.parse(value);
}

export function getRoomStagePresentation(stage: RoomStage) {
  return ROOM_STAGE_PRESENTATION[stage];
}
