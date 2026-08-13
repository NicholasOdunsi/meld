import type { RoomStage } from "@meld/contracts";
import { z } from "zod";
import {
  PixelCode,
  PixelLightBulb,
  PixelPaintBrush,
  PixelPen,
} from "@/ui/pixel-icons";
import { RoomLifecycleRowSchema } from "./schemas";

// Trialling the HackerNoon Pixel Icon Library's pixel-art style in place of
// boxicons for stage glyphs -- see @/ui/pixel-icons for the source and
// licensing note. No literal "palette" glyph exists in that set; paint-brush
// is the closest match for Design.
export const ROOM_STAGE_PRESENTATION = {
  discovery: { label: "Discovery", icon: PixelLightBulb },
  define: { label: "Define", icon: PixelPen },
  design: { label: "Design", icon: PixelPaintBrush },
  development: { label: "Development", icon: PixelCode },
} as const;

export { RoomLifecycleRowSchema };

export type RoomLifecycleRow = z.infer<typeof RoomLifecycleRowSchema>;

export function parseRoomLifecycleRow(value: unknown): RoomLifecycleRow {
  return RoomLifecycleRowSchema.parse(value);
}

export function getRoomStagePresentation(stage: RoomStage) {
  return ROOM_STAGE_PRESENTATION[stage];
}
