"use server";

import { z } from "zod";
import type { ScreenSource } from "@meld/screen-runtime/source";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";

/** E2E persistence probe. Never exposes fake state outside an authenticated editor session. */
export async function readCanvasEditTestState(screenId: string): Promise<
  { status: "ok"; versionId: string; versionCount: number; source: ScreenSource } | { status: "error" }
> {
  if (!isRoomFakeEnabled() || !z.string().uuid().safeParse(screenId).success) return { status: "error" };
  try {
    const { fakeEditTestState } = await import("./canvas-screen-source-fake");
    const state = fakeEditTestState(screenId);
    if (!state) return { status: "error" };
    const { fakeGetRoom } = await import("@/features/rooms/e2e-fake");
    const room = await fakeGetRoom(state.roomId);
    if (!room.participants.some(participant => participant.userId === room.currentUser.id && participant.access === "edit")) return { status: "error" };
    return { status: "ok", versionId: state.versionId, versionCount: state.versionCount, source: state.source };
  } catch { return { status: "error" }; }
}
