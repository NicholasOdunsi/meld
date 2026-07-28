import "server-only";

import { getDiscoveryBackend } from "./backend";
import {
  DiscoveryRoomInputSchema,
  MessageInputSchema,
} from "./schemas";

// Reads consumed only by server components. Deliberately not in the
// "use server" module: every export there becomes a callable endpoint, and
// nothing in the browser asks for these.

export async function listDiscoveryRooms(organizationId: string) {
  const parsed = DiscoveryRoomInputSchema.shape.organizationId.parse(
    organizationId,
  );
  const backend = await getDiscoveryBackend();
  return backend.listRooms(parsed);
}

export async function getDiscoveryRoomPageData(input: {
  organizationId: string;
  roomId: string;
}) {
  const organizationId =
    DiscoveryRoomInputSchema.shape.organizationId.parse(
      input.organizationId,
    );
  const roomId = MessageInputSchema.shape.roomId.parse(input.roomId);
  const backend = await getDiscoveryBackend();
  return backend.getRoomPageData({ organizationId, roomId });
}
