import { z } from "zod";
import type { Screen } from "./screen-store";

export const MAX_SAVED_BYTES = 4_000_000;

// One screen's stored HTML. A larger screen would make every board save fail,
// so anything that writes to the screen store must respect this.
export const MAX_SCREEN_HTML_CHARS = 200_000;

const ScreenSchema = z.object({
  id: z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/),
  rev: z.number().int().min(1),
  html: z.string().max(MAX_SCREEN_HTML_CHARS),
  snapshot: z.literal(true).optional(),
}).strict();

const SavedSchema = z.object({
  version: z.literal(1),
  elements: z.array(z.object({ id: z.string().min(1), type: z.string().min(1) }).passthrough()).max(5000),
  screens: z.array(ScreenSchema).max(200),
}).strict();

export type SavedBoard = z.infer<typeof SavedSchema>;

export function boardStorageKey(boardId?: string): string {
  return `orion:canvas-excalidraw:${boardId ?? "local"}`;
}

export function encodeBoard(
  elements: readonly { id: string; type: string; isDeleted?: boolean }[],
  screens: Screen[],
): string {
  return JSON.stringify({ version: 1, elements: elements.filter((element) => !element.isDeleted), screens });
}

export function decodeBoard(raw: string | null): SavedBoard | null {
  if (!raw || raw.length > MAX_SAVED_BYTES) return null;
  try {
    const parsed = SavedSchema.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

export function loadBoard(storage: Pick<Storage, "getItem">, key: string): SavedBoard | null {
  try {
    return decodeBoard(storage.getItem(key));
  } catch {
    return null;
  }
}

export function saveBoard(
  storage: Pick<Storage, "setItem">,
  key: string,
  elements: readonly { id: string; type: string; isDeleted?: boolean }[],
  screens: Screen[],
): boolean {
  try {
    const encoded = encodeBoard(elements, screens);
    if (encoded.length > MAX_SAVED_BYTES) return false;
    storage.setItem(key, encoded);
    return true;
  } catch {
    return false;
  }
}
