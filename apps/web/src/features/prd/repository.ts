import type { SupabaseClient } from "@supabase/supabase-js";
import { RoomPrdSchema, type RoomPrd } from "./schemas";

export function createPrdRepository(supabase: SupabaseClient) {
  return {
    async getRoomPrd(roomId: string): Promise<RoomPrd | null> {
      const { data, error } = await supabase
        .from("prds")
        .select(
          "id, room_id, version, status, document, owner_id, created_at, updated_at",
        )
        .eq("room_id", roomId)
        .order("version", { ascending: false })
        .limit(1)
        .maybeSingle();
      if (error) throw new Error("Could not load the PRD.");
      if (!data) return null;
      return RoomPrdSchema.parse({
        id: data.id,
        roomId: data.room_id,
        version: data.version,
        status: data.status,
        document: data.document,
        ownerId: data.owner_id,
        createdAt: data.created_at,
        updatedAt: data.updated_at,
      });
    },
    async roomHasPrd(roomId: string): Promise<boolean> {
      const { count, error } = await supabase
        .from("prds")
        .select("id", { count: "exact", head: true })
        .eq("room_id", roomId);
      if (error) throw new Error("Could not check for a PRD.");
      return (count ?? 0) > 0;
    },
  };
}
