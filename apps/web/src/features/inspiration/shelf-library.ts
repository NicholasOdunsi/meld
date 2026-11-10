import "server-only";

import {
  INSPIRATION_LIMITS,
  InspirationMimeTypeSchema,
  type ShelfCountResponse,
  type ShelfLabelState,
  type ShelfLibraryItem,
  type ShelfLibraryPage,
} from "@meld/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";
import { createInspirationStorage } from "./inspiration-storage";
import type { ShelfPrincipal } from "./shelf-auth";

export type ShelfLibraryError = "unauthorized" | "not_found" | "invalid_request" | "unavailable";
export type ShelfLibraryResult<T> = { ok: true; value: T } | { ok: false; error: ShelfLibraryError };

export interface ShelfLibrary {
  list(offset: number): Promise<ShelfLibraryResult<ShelfLibraryPage>>;
  updateNote(itemId: string, note: string | null): Promise<ShelfLibraryResult<ShelfLibraryItem>>;
  remove(ids: string[]): Promise<ShelfLibraryResult<ShelfCountResponse>>;
  addToRoom(ids: string[], roomId: string): Promise<ShelfLibraryResult<ShelfCountResponse>>;
}

const PAGE = INSPIRATION_LIMITS.shelfLibraryPageSize;

const LibraryRowSchema = z.object({
  id: z.string().uuid(),
  width: z.number().int().positive(),
  height: z.number().int().positive(),
  mime_type: InspirationMimeTypeSchema,
  note: z.string().nullable(),
  source_url: z.string().nullable(),
  created_at: z.string(),
  storage_path: z.string(),
  label_status: z.enum(["unsorted", "sorted", "unsortable"]).nullable(),
  description: z.string().nullable(),
  rooms: z.array(z.object({ room_id: z.string().uuid(), room_name: z.string(), project_name: z.string() })),
});
type LibraryRow = z.infer<typeof LibraryRowSchema>;

function labelState(status: LibraryRow["label_status"]): ShelfLabelState {
  if (status === "sorted") return "done";
  if (status === "unsortable") return "skipped";
  return "pending";
}

function toItem(row: LibraryRow, imageUrl: string | null): ShelfLibraryItem {
  return {
    id: row.id,
    width: row.width,
    height: row.height,
    mimeType: row.mime_type,
    note: row.note,
    sourceUrl: row.source_url,
    createdAt: new Date(row.created_at).toISOString(),
    description: labelState(row.label_status) === "done" ? row.description : null,
    labelState: labelState(row.label_status),
    rooms: row.rooms.map((room) => ({ roomId: room.room_id, roomName: room.room_name, projectName: room.project_name })),
    imageUrl,
  };
}

function failure(message: string | undefined): { ok: false; error: ShelfLibraryError } {
  if (message?.includes("not_authorized")) return { ok: false, error: "unauthorized" };
  if (message?.includes("not_found")) return { ok: false, error: "not_found" };
  if (message?.includes("invalid_request")) return { ok: false, error: "invalid_request" };
  return { ok: false, error: "unavailable" };
}

export function createShelfLibrary(client: SupabaseClient, principal: ShelfPrincipal): ShelfLibrary {
  const scope = { actor_user_id: principal.userId, target_workspace_id: principal.workspaceId };
  const storage = createInspirationStorage(client);

  async function page(offset: number, limit: number): Promise<ShelfLibraryResult<LibraryRow[]>> {
    const { data, error } = await client.rpc("capture_list_inspiration", { ...scope, page_offset: offset, page_limit: limit });
    if (error) return failure(error.message);
    const rows = z.array(LibraryRowSchema).safeParse(data);
    if (!rows.success) return { ok: false, error: "unavailable" };
    return { ok: true, value: rows.data };
  }

  async function signed(rows: LibraryRow[]): Promise<ShelfLibraryItem[]> {
    const urls = await storage.signUrls(rows.map((row) => row.storage_path));
    return rows.map((row) => toItem(row, urls.get(row.storage_path) ?? null));
  }

  return {
    async list(offset) {
      // One extra row tells us whether there is a next page.
      const rows = await page(offset, PAGE + 1);
      if (!rows.ok) return rows;
      const items = await signed(rows.value.slice(0, PAGE));
      return { ok: true, value: { items, nextOffset: rows.value.length > PAGE ? offset + PAGE : null } };
    },

    async updateNote(itemId, note) {
      const { error } = await client.rpc("capture_update_inspiration_note", { ...scope, target_item_id: itemId, item_note: note });
      if (error) return failure(error.message);
      // Re-read the one row so the app gets the stored (trimmed) note back.
      let offset = 0;
      for (;;) {
        const rows = await page(offset, 200);
        if (!rows.ok) return rows;
        const row = rows.value.find((candidate) => candidate.id === itemId);
        if (row) return { ok: true, value: (await signed([row]))[0] };
        if (rows.value.length < 200) return { ok: false, error: "not_found" };
        offset += 200;
      }
    },

    async remove(ids) {
      const { data, error } = await client.rpc("capture_delete_inspiration_items", { ...scope, target_item_ids: ids });
      if (error) return failure(error.message);
      const paths = z.array(z.string()).safeParse(data);
      if (!paths.success) return { ok: false, error: "unavailable" };
      // The rows are gone either way; an orphaned object is harmless and private.
      await storage.remove(paths.data).catch(() => console.error("inspiration object removal failed", { count: paths.data.length }));
      return { ok: true, value: { count: paths.data.length } };
    },

    async addToRoom(ids, roomId) {
      const { data, error } = await client.rpc("capture_link_inspiration_items", { ...scope, target_room_id: roomId, target_item_ids: ids });
      if (error) return failure(error.message);
      return { ok: true, value: { count: Number(data) } };
    },
  };
}

export function createFakeShelfLibrary(principal: ShelfPrincipal): ShelfLibrary {
  const load = () => import("./inspiration-fake");
  return {
    async list(offset) {
      const items = (await load()).fakeShelfLibraryItems(principal.workspaceId);
      const pageItems = items.slice(offset, offset + PAGE);
      return { ok: true, value: { items: pageItems, nextOffset: items.length > offset + PAGE ? offset + PAGE : null } };
    },
    async updateNote(itemId, note) {
      const fake = await load();
      fake.fakeUpdateNote(itemId, note?.trim() ? note.trim() : null);
      const item = fake.fakeShelfLibraryItems(principal.workspaceId).find((candidate) => candidate.id === itemId);
      return item ? { ok: true, value: item } : { ok: false, error: "not_found" };
    },
    async remove(ids) {
      return { ok: true, value: { count: (await load()).fakeDeleteItems(ids) } };
    },
    async addToRoom(ids, roomId) {
      return { ok: true, value: { count: (await load()).fakeLinkToRoom(roomId, ids) } };
    },
  };
}
