import { INSPIRATION_LIMITS, ShelfUploadFieldsSchema, type ShelfUploadResponse } from "@meld/contracts";
import { z } from "zod";
import { createInspirationRepository } from "@/features/inspiration/inspiration-repository";
import { createInspirationStorage } from "@/features/inspiration/inspiration-storage";
import { saveInspirationItem } from "@/features/inspiration/save-inspiration-item";
import { authenticateShelfRequest } from "@/features/inspiration/shelf-auth";
import { shelfError } from "@/features/inspiration/shelf-responses";
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
    console.error("Shelf server configuration error");
    return shelfError("unavailable");
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

  const response: ShelfUploadResponse = {
    itemId: result.itemId,
    duplicate: result.duplicate,
    roomLinked: result.roomLinked,
  };
  return Response.json(response, { status: result.duplicate ? 200 : 201 });
}
