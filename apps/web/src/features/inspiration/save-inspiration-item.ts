import type { CaptureChannel } from "@meld/contracts";
import { validateImageBytes, type ImageValidationError } from "./image-validation";
import type { InspirationRepository } from "./inspiration-repository";
import type { InspirationStorage } from "./inspiration-storage";

export type SaveInspirationInput = {
  workspaceId: string;
  bytes: Uint8Array;
  note: string | null;
  sourceUrl: string | null;
  roomId: string | null;
  channel: CaptureChannel;
};

export type SaveInspirationResult =
  | { ok: true; itemId: string; duplicate: boolean; roomLinked: boolean }
  | { ok: false; error: ImageValidationError | "unavailable" };

// The ONE write path for inspiration images (spec Part C). Shelf uploads and
// web uploads differ only in which repository/storage they pass in.
export async function saveInspirationItem(
  input: SaveInspirationInput,
  { repository, storage }: { repository: InspirationRepository; storage: InspirationStorage },
): Promise<SaveInspirationResult> {
  const validated = validateImageBytes(input.bytes);
  if (!validated.ok) return { ok: false, error: validated.error };
  const image = validated.image;

  let intent: Awaited<ReturnType<InspirationRepository["createIntent"]>>;
  try {
    intent = await repository.createIntent({
      workspaceId: input.workspaceId,
      contentHash: image.contentHash,
      mimeType: image.mimeType,
      byteSize: image.byteSize,
      width: image.width,
      height: image.height,
      sourceUrl: input.sourceUrl,
      note: input.note,
      channel: input.channel,
    });
  } catch (error) {
    console.error("inspiration intent failed", { code: errorCode(error) });
    return { ok: false, error: "unavailable" };
  }

  const itemId = intent.item.id;
  if (!intent.duplicate) {
    try {
      await storage.upload(intent.item.storage_path, input.bytes, image.mimeType);
      await repository.finalize(itemId);
    } catch (error) {
      console.error("inspiration upload failed", { code: errorCode(error) });
      await repository.fail(itemId).catch(() => undefined);
      return { ok: false, error: "unavailable" };
    }
  }

  let roomLinked = false;
  if (input.roomId) {
    try {
      await repository.linkToRoom(input.roomId, [itemId]);
      roomLinked = true;
    } catch (error) {
      // A room problem never fails the save (spec E3).
      console.error("inspiration room link failed", { code: errorCode(error) });
    }
  }

  return { ok: true, itemId, duplicate: intent.duplicate, roomLinked };
}

function errorCode(error: unknown): string {
  return error instanceof Error && "code" in error ? String(error.code) : "unknown";
}
