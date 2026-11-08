"use server";

import { INSPIRATION_LIMITS, type InspirationItemView, type ShelfRoom } from "@meld/contracts";
import { z } from "zod";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createClient } from "@/lib/supabase/server";
import { INSPIRATION_ITEM_COLUMNS, toViews } from "./inspiration-shared";
import { createInspirationStorage } from "./inspiration-storage";

export type LibraryPage = { items: InspirationItemView[]; hasMore: boolean };

const EMPTY_PAGE: LibraryPage = { items: [], hasMore: false };
const ITEM_WITH_LINKS = `${INSPIRATION_ITEM_COLUMNS},room_inspiration(room_id)`;
const LibraryInput = z.object({ workspaceId: z.string().uuid(), offset: z.number().int().min(0) }).strict();
const Uuid = z.string().uuid();

export async function listLibrary(input: z.input<typeof LibraryInput>): Promise<LibraryPage> {
  const parsed = LibraryInput.safeParse(input);
  if (!parsed.success) return EMPTY_PAGE;
  if (isRoomFakeEnabled()) {
    const { fakeListLibrary } = await import("./inspiration-fake");
    return fakeListLibrary(parsed.data);
  }

  const { workspaceId, offset } = parsed.data;
  const supabase = await createClient(new Headers());
  // One extra row tells us whether "Load more" should show.
  const { data, error } = await supabase
    .from("inspiration_items")
    .select(ITEM_WITH_LINKS)
    .eq("workspace_id", workspaceId)
    .eq("status", "ready")
    .order("created_at", { ascending: false })
    .range(offset, offset + INSPIRATION_LIMITS.pageSize);
  if (error || !data) {
    console.error("listLibrary failed", { code: error?.code });
    return EMPTY_PAGE;
  }
  const rows = data.slice(0, INSPIRATION_LIMITS.pageSize);
  return {
    items: await toViews(rows, createInspirationStorage(supabase)),
    hasMore: data.length > INSPIRATION_LIMITS.pageSize,
  };
}

const LinkRowsSchema = z.array(z.object({ created_at: z.string(), inspiration_items: z.unknown() }));

export async function listRoomInspiration(roomId: string): Promise<InspirationItemView[]> {
  if (!Uuid.safeParse(roomId).success) return [];
  if (isRoomFakeEnabled()) {
    const { fakeListRoomInspiration } = await import("./inspiration-fake");
    return fakeListRoomInspiration(roomId);
  }

  const supabase = await createClient(new Headers());
  const { data, error } = await supabase
    .from("room_inspiration")
    .select(`created_at,inspiration_items(${ITEM_WITH_LINKS})`)
    .eq("room_id", roomId)
    .order("created_at", { ascending: false });
  const links = LinkRowsSchema.safeParse(data);
  if (error || !links.success) {
    console.error("listRoomInspiration failed", { code: error?.code });
    return [];
  }
  return toViews(
    links.data.map((link) => link.inspiration_items),
    createInspirationStorage(supabase),
  );
}

const EditableRoomRowsSchema = z.array(
  z.object({
    room_id: z.string().uuid(),
    rooms: z.object({ name: z.string(), workspace_id: z.string().uuid(), projects: z.object({ name: z.string() }) }),
  }),
);

export async function listEditableRooms(workspaceId: string): Promise<ShelfRoom[]> {
  if (!Uuid.safeParse(workspaceId).success) return [];
  if (isRoomFakeEnabled()) {
    const { fakeListEditableRooms } = await import("./inspiration-fake");
    return fakeListEditableRooms();
  }

  const supabase = await createClient(new Headers());
  const { data: auth } = await supabase.auth.getUser();
  const userId = auth?.user?.id;
  if (!userId) return [];
  const { data, error } = await supabase
    .from("room_participants")
    .select("room_id,rooms!inner(name,workspace_id,projects(name))")
    .eq("user_id", userId)
    .eq("access", "edit")
    .eq("rooms.workspace_id", workspaceId);
  const rows = EditableRoomRowsSchema.safeParse(data);
  if (error || !rows.success) {
    console.error("listEditableRooms failed", { code: error?.code });
    return [];
  }
  return rows.data
    .map((row) => ({ roomId: row.room_id, roomName: row.rooms.name, projectName: row.rooms.projects.name }))
    .sort((a, b) => a.projectName.localeCompare(b.projectName) || a.roomName.localeCompare(b.roomName));
}
