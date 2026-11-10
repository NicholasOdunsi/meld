import { INSPIRATION_LIMITS, ShelfUploadFieldsSchema, type ShelfUploadResponse } from "@meld/contracts";
import { z } from "zod";
import { validateImageBytes } from "@/features/inspiration/image-validation";
import { createInspirationRepository } from "@/features/inspiration/inspiration-repository";
import { createInspirationStorage } from "@/features/inspiration/inspiration-storage";
import { saveInspirationItem } from "@/features/inspiration/save-inspiration-item";
import { authenticateShelfRequest } from "@/features/inspiration/shelf-auth";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { scheduleInspirationSort } from "@/features/inspiration/sorting/schedule-inspiration-sort";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

function textField(form: FormData, name: string): string | null {
  const value = form.get(name);
  return typeof value === "string" ? value : null;
}

// A room problem never fails the upload (spec E3), so a junk id becomes "no room".
function roomIdOrNull(value: string | null): string | null {
  return z.string().uuid().safeParse(value).success ? value : null;
}

export async function POST(request: Request) {
  let supabase: ReturnType<typeof createShelfServerClient>;
  try {
    supabase = createShelfServerClient();
  } catch {
    if (!isRoomFakeEnabled()) {
      console.error("Shelf server configuration error");
      return shelfError("unavailable");
    }
    supabase = {} as ReturnType<typeof createShelfServerClient>;
  }

  const principal = await authenticateShelfRequest(request, supabase);
  if (!principal) return shelfError("unauthorized");

  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return shelfError("invalid_image");
  }
  const file = form.get("file");
  if (!(file instanceof Blob)) return shelfError("invalid_image");
  if (file.size > INSPIRATION_LIMITS.maxBytes) return shelfError("too_large");

  const fields = ShelfUploadFieldsSchema.parse({
    note: textField(form, "note"),
    sourceUrl: textField(form, "sourceUrl"),
    roomId: roomIdOrNull(textField(form, "roomId")),
  });

  if (isRoomFakeEnabled()) {
    const bytes = new Uint8Array(await file.arrayBuffer());
    const validated = validateImageBytes(bytes);
    if (!validated.ok) return shelfError(validated.error);
    const { fakeSaveInspiration } = await import("@/features/inspiration/inspiration-fake");
    const saved = fakeSaveInspiration({
      workspaceId: principal.workspaceId,
      bytes,
      mimeType: validated.image.mimeType,
      roomId: fields.roomId,
      width: validated.image.width,
      height: validated.image.height,
    });
    if (!saved.ok) return shelfError(saved.error);
    return Response.json({ itemId: saved.itemId, duplicate: saved.duplicate, roomLinked: saved.roomLinked }, { status: saved.duplicate ? 200 : 201 });
  }

  const result = await saveInspirationItem(
    {
      workspaceId: principal.workspaceId,
      bytes: new Uint8Array(await file.arrayBuffer()),
      note: fields.note,
      sourceUrl: fields.sourceUrl,
      roomId: fields.roomId,
      channel: "shelf",
    },
    {
      repository: createInspirationRepository(supabase, { kind: "capture", userId: principal.userId }),
      storage: createInspirationStorage(supabase),
    },
  );
  if (!result.ok) return shelfError(result.error);
  if (!result.duplicate) scheduleInspirationSort(principal.workspaceId, principal.userId);

  const response: ShelfUploadResponse = {
    itemId: result.itemId,
    duplicate: result.duplicate,
    roomLinked: result.roomLinked,
  };
  return Response.json(response, { status: result.duplicate ? 200 : 201 });
}
