import "server-only";

import { getRoomBackend } from "./backend";
import {
  RoomInputSchema,
  MessageInputSchema,
} from "./schemas";

// Reads consumed only by server components. Deliberately not in the
// "use server" module: every export there becomes a callable endpoint, and
// nothing in the browser asks for these.

export async function listRooms(workspaceId: string) {
  const parsed = RoomInputSchema.shape.workspaceId.parse(
    workspaceId,
  );
  const backend = await getRoomBackend();
  return backend.listRooms(parsed);
}

export async function getRoomPageData(input: {
  workspaceId: string;
  roomId: string;
  includeMessages?: boolean;
}) {
  const workspaceId =
    RoomInputSchema.shape.workspaceId.parse(
      input.workspaceId,
    );
  const roomId = MessageInputSchema.shape.roomId.parse(input.roomId);
  const backend = await getRoomBackend();
  return backend.getRoomPageData({
    workspaceId,
    roomId,
    includeMessages: input.includeMessages,
  });
}
