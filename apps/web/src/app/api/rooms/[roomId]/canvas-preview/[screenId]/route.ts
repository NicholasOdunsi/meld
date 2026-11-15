import { z } from "zod";
import { readRoomExcalidrawBoard } from "@/features/canvas-excalidraw/room-board-actions";
import { buildFrameDocument, FRAME_CSP } from "@/features/canvas-excalidraw/frame-document";

const RoomId = z.string().uuid();
const ScreenId = z.string().regex(/^[a-z][a-z0-9_-]{0,63}$/);

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ roomId: string; screenId: string }> },
) {
  const { roomId, screenId } = await params;
  if (!RoomId.safeParse(roomId).success || !ScreenId.safeParse(screenId).success) {
    return new Response("Not found", { status: 404 });
  }
  const board = await readRoomExcalidrawBoard(roomId);
  if (board.status !== "ok") return new Response("Not found", { status: 404 });
  const screen = board.screens.find((candidate) => candidate.id === screenId);
  if (!screen) return new Response("Not found", { status: 404 });
  return new Response(buildFrameDocument(screen.html), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Content-Security-Policy": `sandbox allow-scripts; ${FRAME_CSP}; frame-ancestors 'none'`,
      "Cache-Control": "private, no-store",
      "Referrer-Policy": "no-referrer",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
