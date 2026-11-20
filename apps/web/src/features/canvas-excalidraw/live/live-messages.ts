import { z } from "zod";
import { FRAME_MESSAGE_SOURCE } from "@meld/screen-runtime/bridge";
import { SCREEN_KEY } from "@meld/screen-runtime/constants";
import { MAX_SCREEN_HTML_CHARS } from "../board-persistence";

const source = z.literal(FRAME_MESSAGE_SOURCE);
const LiveFrameMessageSchema = z.discriminatedUnion("type", [
  z.object({ source, type: z.literal("ready") }).strict(),
  z.object({ source, type: z.literal("stuck") }).strict(),
  z.object({ source, type: z.literal("escape") }).strict(),
  z.object({ source, type: z.literal("error"), message: z.string().max(500) }).strict(),
  z.object({ source, type: z.literal("goto"), screenKey: z.string().regex(SCREEN_KEY) }).strict(),
  z.object({ source, type: z.literal("snapshot"), html: z.string().max(MAX_SCREEN_HTML_CHARS) }).strict(),
]);

export type LiveFrameMessage = z.infer<typeof LiveFrameMessageSchema>;

// Only the one live frame may talk to the board, and only in these shapes.
export function parseLiveFrameMessage(event: { source: unknown; data: unknown }, frameWindow: unknown): LiveFrameMessage | null {
  if (!frameWindow || event.source !== frameWindow) return null;
  const parsed = LiveFrameMessageSchema.safeParse(event.data);
  return parsed.success ? parsed.data : null;
}
