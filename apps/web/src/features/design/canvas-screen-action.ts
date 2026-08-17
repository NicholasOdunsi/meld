"use server";

import {
  readRoomCanvasScreens,
  type CanvasScreenReadResult,
} from "./canvas-screen-reader";

// A "use server" boundary over the server-only canvas-screen reader, so client
// components (e.g. the room Conversation, which blends design turns and needs
// each screen's preview markup for thumbnails) can fetch it as an action
// without pulling the server-only module into the client bundle.
export async function getRoomCanvasScreens(
  roomId: string,
): Promise<CanvasScreenReadResult> {
  return readRoomCanvasScreens(roomId);
}
