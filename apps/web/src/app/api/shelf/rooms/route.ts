import type { ShelfRoom } from "@meld/contracts";
import { z } from "zod";
import { authenticateShelfRequest } from "@/features/inspiration/shelf-auth";
import { shelfError } from "@/features/inspiration/shelf-responses";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { createShelfServerClient } from "@/lib/supabase/shelf-server";

const RoomRowsSchema = z.array(
  z.object({ room_id: z.string().uuid(), room_name: z.string(), project_name: z.string() }),
);

export async function GET(request: Request) {
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

  if (isRoomFakeEnabled()) {
    const { fakeListEditableRooms } = await import("@/features/inspiration/inspiration-fake");
    return Response.json(fakeListEditableRooms());
  }

  const { data, error } = await supabase.rpc("list_capture_rooms", {
    actor_user_id: principal.userId,
    target_workspace_id: principal.workspaceId,
  });
  const rows = RoomRowsSchema.safeParse(data);
  if (error || !rows.success) {
    console.error("list_capture_rooms failed");
    return shelfError("unavailable");
  }

  const rooms: ShelfRoom[] = rows.data.map((row) => ({
    roomId: row.room_id,
    roomName: row.room_name,
    projectName: row.project_name,
  }));
  return Response.json(rooms);
}
