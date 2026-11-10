import "server-only";

import { TasteBoardSchema, type TasteBoard } from "@meld/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const RoomSchema = z.object({ workspace_id: z.string().uuid() });

export type LoadedTaste = { board: TasteBoard | null; appleRules: boolean };
const NO_TASTE: LoadedTaste = { board: null, appleRules: true };

// Best-effort, session-scoped: RLS returns only the caller's own profile.
export async function loadTasteProfile(supabase: SupabaseClient, roomId: string): Promise<LoadedTaste> {
  try {
    const room = await supabase.from("rooms").select("workspace_id").eq("id", roomId).maybeSingle();
    const parsedRoom = RoomSchema.safeParse(room.data);
    if (room.error || !parsedRoom.success) return NO_TASTE;
    const profile = await supabase
      .from("taste_profiles")
      .select("board,apple_rules")
      .eq("workspace_id", parsedRoom.data.workspace_id)
      .maybeSingle();
    if (profile.error || !profile.data) return NO_TASTE;
    const row = profile.data as { board: unknown; apple_rules?: boolean };
    const board = TasteBoardSchema.safeParse(row.board);
    return { board: board.success ? board.data : null, appleRules: row.apple_rules !== false };
  } catch {
    return NO_TASTE;
  }
}

export async function loadTasteBoard(supabase: SupabaseClient, roomId: string): Promise<TasteBoard | null> {
  return (await loadTasteProfile(supabase, roomId)).board;
}
