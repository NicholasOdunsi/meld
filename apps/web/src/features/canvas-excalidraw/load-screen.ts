"use server";

import { listRoomCanvasScreens } from "@/features/design/canvas-screen-reader";
import type { CanvasScreen } from "@/features/design/canvas-screen-reader";

// The built screen as the existing reader returns it; the client assembles the
// page with the same theme CSS the canvas preview uses.
export async function loadRoomScreen(roomId: string, screenId: string): Promise<CanvasScreen | null> {
  const screens = await listRoomCanvasScreens(roomId);
  return screens.find((screen) => screen.id === screenId) ?? null;
}

export async function listBuiltRoomScreenIds(roomId: string): Promise<string[]> {
  const screens = await listRoomCanvasScreens(roomId);
  return screens.filter((screen) => screen.state === "built").map((screen) => screen.id);
}
