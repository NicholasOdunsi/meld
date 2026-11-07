import "server-only";

import { TasteBoardSchema, type TasteBoard } from "@meld/contracts";
import type { SupabaseClient } from "@supabase/supabase-js";
import { z } from "zod";

const RoomSchema = z.object({ workspace_id: z.string().uuid() });

// Best-effort, session-scoped: RLS returns only the caller's own profile.
export async function loadTasteBoard(supabase: SupabaseClient, roomId: string): Promise<TasteBoard | null> {
  try {
    const room = await supabase.from("rooms").select("workspace_id").eq("id", roomId).maybeSingle();
    const parsedRoom = RoomSchema.safeParse(room.data);
    if (room.error || !parsedRoom.success) return null;
    const profile = await supabase
      .from("taste_profiles")
      .select("board")
      .eq("workspace_id", parsedRoom.data.workspace_id)
      .maybeSingle();
    if (profile.error || !profile.data) return null;
    const board = TasteBoardSchema.safeParse((profile.data as { board: unknown }).board);
    return board.success ? board.data : null;
  } catch {
    return null;
  }
}
