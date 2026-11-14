"use server";

import { z } from "zod";
import { createClient } from "@/lib/supabase/server";
import { isRoomFakeEnabled } from "@/features/rooms/e2e-gate";
import { decodeBoard, encodeBoard, type SavedBoard } from "./board-persistence";
import type { Screen } from "./screen-store";

const RoomId = z.string().uuid();
type Elements = SavedBoard["elements"];
type BoardResult =
  | { status: "ok"; revision: number; elements: Elements; screens: Screen[] }
  | { status: "error" };
type SaveResult =
  | { status: "saved"; revision: number }
  | { status: "conflict"; revision: number }
  | { status: "error" };

const fakeBoards = new Map<string, { revision: number; document: SavedBoard }>();

export async function readRoomExcalidrawBoard(roomId: string): Promise<BoardResult> {
  if (!RoomId.safeParse(roomId).success) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const board = fakeBoards.get(roomId);
    return { status: "ok", revision: board?.revision ?? 0, elements: board?.document.elements ?? [], screens: board?.document.screens ?? [] };
  }
  try {
    const client = await createClient(new Headers());
    // A missing board is not evidence of room access; verify membership first.
    const room = await client.from("rooms").select("id").eq("id", roomId).maybeSingle();
    if (room.error || !room.data) return { status: "error" };
    const result = await client.from("room_excalidraw_boards")
      .select("revision,document").eq("room_id", roomId).maybeSingle();
    if (result.error) return { status: "error" };
    if (!result.data) return { status: "ok", revision: 0, elements: [], screens: [] };
    const document = decodeBoard(JSON.stringify(result.data.document));
    if (!document || !Number.isSafeInteger(result.data.revision)) return { status: "error" };
    return { status: "ok", revision: result.data.revision, elements: document.elements, screens: document.screens };
  } catch {
    return { status: "error" };
  }
}

export async function saveRoomExcalidrawBoard(
  roomId: string,
  expectedRevision: number,
  elements: Elements,
  screens: Screen[],
): Promise<SaveResult> {
  if (!RoomId.safeParse(roomId).success || !Number.isSafeInteger(expectedRevision) || expectedRevision < 0) return { status: "error" };
  let document: SavedBoard | null;
  try {
    document = decodeBoard(encodeBoard(elements, screens));
  } catch {
    return { status: "error" };
  }
  if (!document) return { status: "error" };
  if (isRoomFakeEnabled()) {
    const old = fakeBoards.get(roomId);
    const revision = old?.revision ?? 0;
    if (revision !== expectedRevision) return { status: "conflict", revision };
    fakeBoards.set(roomId, { revision: revision + 1, document });
    return { status: "saved", revision: revision + 1 };
  }
  try {
    const client = await createClient(new Headers());
    const result = await client.rpc("save_room_excalidraw_board", {
      target_room_id: roomId,
      expected_revision: expectedRevision,
      next_document: document,
    });
    if (result.error) return { status: "error" };
    const parsed = z.discriminatedUnion("status", [
      z.object({ status: z.literal("saved"), revision: z.number().int().positive() }),
      z.object({ status: z.literal("conflict"), revision: z.number().int().nonnegative() }),
    ]).safeParse(result.data);
    return parsed.success ? parsed.data : { status: "error" };
  } catch {
    return { status: "error" };
  }
}
