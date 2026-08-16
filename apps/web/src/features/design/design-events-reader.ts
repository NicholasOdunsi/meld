"use server";
import { DesignScreenEventSchema, type DesignScreenEvent } from "@meld/contracts";
import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

const EventRow = z
  .object({
    id: z.string().uuid(),
    room_id: z.string().uuid(),
    screen_id: z.string().uuid().nullable(),
    kind: z.string(),
    message_id: z.string().uuid().nullable(),
    task_id: z.string().uuid().nullable(),
    version_id: z.string().uuid().nullable(),
    actor: z.string().uuid().nullable(),
    created_at: z.string(),
  })
  .passthrough();

export async function listRoomDesignEvents(
  roomId: string,
): Promise<DesignScreenEvent[]> {
  const id = z.string().uuid().safeParse(roomId);
  if (!id.success) return [];
  try {
    if (isRoomFakeEnabled()) {
      const { fakeListRoomDesignEvents } = await import(
        "@/features/rooms/e2e-fake"
      );
      return await fakeListRoomDesignEvents(id.data);
    }
    const supabase = await createClient(new Headers());
    const { data, error } = await supabase
      .from("design_screen_events")
      .select("id,room_id,screen_id,kind,message_id,task_id,version_id,actor,created_at")
      .eq("room_id", id.data)
      .order("created_at", { ascending: true });
    if (error) {
      console.error("listRoomDesignEvents error", { roomId, error });
      return [];
    }
    const rows = z.array(EventRow).safeParse(data ?? []);
    if (!rows.success) return [];
    return rows.data.flatMap((row) => {
      const parsed = DesignScreenEventSchema.safeParse({
        id: row.id,
        roomId: row.room_id,
        screenId: row.screen_id,
        kind: row.kind,
        messageId: row.message_id,
        taskId: row.task_id,
        versionId: row.version_id,
        actor: row.actor,
        createdAt: row.created_at,
      });
      return parsed.success ? [parsed.data] : [];
    });
  } catch (thrown) {
    console.error("listRoomDesignEvents threw", { roomId, thrown });
    return [];
  }
}
