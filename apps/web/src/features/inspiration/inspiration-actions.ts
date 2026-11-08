"use server";

import { INSPIRATION_LIMITS, normalizeNote } from "@meld/contracts";
import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import { createInspirationRepository } from "./inspiration-repository";
import { createInspirationStorage } from "./inspiration-storage";
import { saveInspirationItem, type SaveInspirationResult } from "./save-inspiration-item";
import { scheduleInspirationSort } from "./sorting/schedule-inspiration-sort";

const Uuid = z.string().uuid();
const ItemIds = z.array(Uuid).min(1).max(INSPIRATION_LIMITS.bulkMax);

export async function uploadInspirationFromWeb(formData: FormData): Promise<SaveInspirationResult> {
  const workspaceId = Uuid.safeParse(formData.get("workspaceId"));
  const file = formData.get("file");
  if (!workspaceId.success || !(file instanceof Blob)) return { ok: false, error: "invalid_image" };
  if (file.size > INSPIRATION_LIMITS.maxBytes) return { ok: false, error: "too_large" };
  const roomIdValue = formData.get("roomId");
  const roomId = Uuid.safeParse(roomIdValue).success ? (roomIdValue as string) : null;
  const bytes = new Uint8Array(await file.arrayBuffer());

  if (isRoomFakeEnabled()) {
    const { fakeSaveInspiration } = await import("./inspiration-fake");
    return fakeSaveInspiration({ workspaceId: workspaceId.data, bytes, mimeType: file.type, roomId });
  }

  const supabase = await createClient(new Headers());
  const { data: auth } = await supabase.auth.getUser();
  const result = await saveInspirationItem(
    { workspaceId: workspaceId.data, bytes, note: null, sourceUrl: null, roomId, channel: "web" },
    {
      repository: createInspirationRepository(supabase, { kind: "session" }),
      storage: createInspirationStorage(supabase),
    },
  );
  if (result.ok && !result.duplicate) scheduleInspirationSort(workspaceId.data, auth.user?.id);
  return result;
}

const NoteInput = z.object({ itemId: Uuid, note: z.string() }).strict();

export async function updateInspirationNote(
  input: z.input<typeof NoteInput>,
): Promise<{ status: "saved"; note: string | null } | { status: "error" }> {
  const parsed = NoteInput.safeParse(input);
  if (!parsed.success) return { status: "error" };
  const note = normalizeNote(parsed.data.note);
  if (isRoomFakeEnabled()) {
    const { fakeUpdateNote } = await import("./inspiration-fake");
    fakeUpdateNote(parsed.data.itemId, note);
    return { status: "saved", note };
  }
  const supabase = await createClient(new Headers());
  const { error } = await supabase.rpc("update_inspiration_note", { target_item_id: parsed.data.itemId, item_note: note });
  if (error) {
    console.error("updateInspirationNote failed", { code: error.message });
    return { status: "error" };
  }
  return { status: "saved", note };
}

const DeleteInput = z.object({ itemIds: ItemIds }).strict();

export async function deleteInspirationItems(
  input: z.input<typeof DeleteInput>,
): Promise<{ status: "deleted"; count: number } | { status: "error" }> {
  const parsed = DeleteInput.safeParse(input);
  if (!parsed.success) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const { fakeDeleteItems } = await import("./inspiration-fake");
    return { status: "deleted", count: fakeDeleteItems(parsed.data.itemIds) };
  }
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("delete_inspiration_items", { target_item_ids: parsed.data.itemIds });
  const paths = z.array(z.string()).safeParse(data);
  if (error || !paths.success) {
    console.error("deleteInspirationItems failed", { code: error?.message });
    return { status: "error" };
  }
  // The rows are gone either way; an orphaned object is harmless and private.
  await createInspirationStorage(supabase)
    .remove(paths.data)
    .catch(() => console.error("inspiration object removal failed", { count: paths.data.length }));
  return { status: "deleted", count: paths.data.length };
}

const LinkInput = z.object({ roomId: Uuid, itemIds: ItemIds }).strict();

export async function linkInspirationToRoom(
  input: z.input<typeof LinkInput>,
): Promise<{ status: "linked"; count: number } | { status: "error" }> {
  const parsed = LinkInput.safeParse(input);
  if (!parsed.success) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const { fakeLinkToRoom } = await import("./inspiration-fake");
    return { status: "linked", count: fakeLinkToRoom(parsed.data.roomId, parsed.data.itemIds) };
  }
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("link_inspiration_to_room", {
    target_room_id: parsed.data.roomId,
    target_item_ids: parsed.data.itemIds,
  });
  if (error) {
    console.error("linkInspirationToRoom failed", { code: error.message });
    return { status: "error" };
  }
  return { status: "linked", count: Number(data) };
}

export async function unlinkInspirationFromRoom(
  input: z.input<typeof LinkInput>,
): Promise<{ status: "unlinked"; count: number } | { status: "error" }> {
  const parsed = LinkInput.safeParse(input);
  if (!parsed.success) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const { fakeUnlinkFromRoom } = await import("./inspiration-fake");
    return { status: "unlinked", count: fakeUnlinkFromRoom(parsed.data.roomId, parsed.data.itemIds) };
  }
  const supabase = await createClient(new Headers());
  const { data, error } = await supabase.rpc("unlink_inspiration_from_room", {
    target_room_id: parsed.data.roomId,
    target_item_ids: parsed.data.itemIds,
  });
  if (error) {
    console.error("unlinkInspirationFromRoom failed", { code: error.message });
    return { status: "error" };
  }
  return { status: "unlinked", count: Number(data) };
}
