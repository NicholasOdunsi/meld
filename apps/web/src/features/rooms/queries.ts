import "server-only";

import { getRoomBackend } from "./backend";
import type { PaneLayout } from "./pane-layout";
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
  requestedSurface?: unknown;
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
    requestedSurface: input.requestedSurface,
  });
}

export async function listRoomDecisions(roomId: string) {
  const parsedRoomId = MessageInputSchema.shape.roomId.parse(roomId);
  const backend = await getRoomBackend();
  return backend.listRoomDecisions(parsedRoomId);
}

export async function getRoomOverview(roomId: string) {
  const parsedRoomId = MessageInputSchema.shape.roomId.parse(roomId);
  const backend = await getRoomBackend();
  return backend.getRoomOverview(parsedRoomId);
}

export async function listRoomTabs(roomId: string) {
  const parsedRoomId = MessageInputSchema.shape.roomId.parse(roomId);
  return (await getRoomBackend()).listRoomTabs(parsedRoomId);
}

export async function createRoomTab(input: {
  roomId: string;
  panes?: PaneLayout;
}) {
  const parsedRoomId = MessageInputSchema.shape.roomId.parse(input.roomId);
  return (await getRoomBackend()).createRoomTab({
    roomId: parsedRoomId,
    panes: input.panes,
  });
}
