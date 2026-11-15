"use server";

import { z } from "zod";
import { isRoomFakeEnabled } from "./e2e-gate";
import { linkStarFollowupInRoom, readStarMetadata, renameGroupInRoom, renameStarInRoom, saveStarFallback, setStarGroupInRoom } from "./star-store";

const ids = z.object({ roomId: z.string().uuid(), taskId: z.string().uuid() });

export async function listRoomStarMetadata(roomId: string) {
  const id = z.string().uuid().parse(roomId);
  if (isRoomFakeEnabled()) return { stars: [], constellations: [] };
  return readStarMetadata(id);
}

export async function linkRoomStarFollowup(input: { roomId: string; taskId: string; title: string; messageId: string }) {
  const parsed = ids.extend({ title: z.string().trim().min(1).max(120), messageId: z.string().uuid() }).parse(input);
  if (isRoomFakeEnabled()) return;
  await saveStarFallback(parsed.roomId, parsed.taskId, parsed.title);
  await linkStarFollowupInRoom(parsed.roomId, parsed.taskId, parsed.messageId);
}

export async function renameRoomStar(input: { roomId: string; taskId: string; title: string }) {
  const parsed = ids.extend({ title: z.string().trim().min(1).max(120) }).parse(input);
  await saveStarFallback(parsed.roomId, parsed.taskId, parsed.title);
  await renameStarInRoom(parsed.roomId, parsed.taskId, parsed.title);
}

export async function setRoomStarConstellation(input: {
  roomId: string; taskId: string; title: string; name: string | null;
}) {
  const parsed = ids.extend({ title: z.string().trim().min(1).max(120), name: z.string().trim().min(1).max(80).nullable() }).parse(input);
  await saveStarFallback(parsed.roomId, parsed.taskId, parsed.title);
  await setStarGroupInRoom(parsed.roomId, parsed.taskId, parsed.name);
}

export async function renameRoomConstellation(input: { roomId: string; currentName: string; nextName: string }) {
  const parsed = z.object({ roomId: z.string().uuid(), currentName: z.string().trim().min(1).max(80),
    nextName: z.string().trim().min(1).max(80) }).parse(input);
  await renameGroupInRoom(parsed.roomId, parsed.currentName, parsed.nextName);
}
