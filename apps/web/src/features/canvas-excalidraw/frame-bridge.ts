import { z } from "zod";
import { FRAME_MESSAGE_SOURCE } from "./frame-document";

const GotoMessage = z
  .object({
    source: z.literal(FRAME_MESSAGE_SOURCE),
    type: z.literal("goto"),
    screenKey: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  })
  .strict();

export type FrameMessage = z.infer<typeof GotoMessage>;

// A frame may only ask for a screen that exists, and only from its own window.
export function parseFrameMessage(
  event: { source: unknown; data: unknown },
  frameWindow: unknown,
  isKnownScreen: (key: string) => boolean,
): FrameMessage | null {
  if (!frameWindow || event.source !== frameWindow) return null;
  const parsed = GotoMessage.safeParse(event.data);
  if (!parsed.success || !isKnownScreen(parsed.data.screenKey)) return null;
  return parsed.data;
}
