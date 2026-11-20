import type { ScreenSource } from "@meld/screen-runtime/source";
import type { readScreenSource } from "@/features/design/canvas-screen-source";
import type { ScreenStore } from "../screen-store";

// `snapshot`: whether the board may replace the stored picture with a copy of
// the running page. Only true for screens whose source lives in the screen
// store; legacy and board-only HTML is the source itself (the Preview route
// runs it with scripts), so it is never overwritten.
export type LiveSource = { source: ScreenSource; snapshot: boolean };

const BOARD_DESIGN_ID = /^ds-([0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12})$/;

export function designScreenIdFromBoardId(boardScreenId: string): string | null {
  return BOARD_DESIGN_ID.exec(boardScreenId)?.[1] ?? null;
}

export async function resolveLiveSource(boardScreenId: string, deps: {
  roomId: string | null;
  store: Pick<ScreenStore, "get">;
  readSource: typeof readScreenSource;
}): Promise<LiveSource | null> {
  const designId = designScreenIdFromBoardId(boardScreenId);
  if (designId && deps.roomId) {
    const read = await deps.readSource(designId);
    if (read.status !== "ok") return null;
    if (!read.screen.legacy) return { source: read.screen.source, snapshot: true };
  }
  const html = deps.store.get(boardScreenId)?.html;
  if (!html) return null;
  // Legacy and board-only screens run from the HTML the board already has.
  // Nothing is saved here: conversion into an html design screen happens on
  // the first edit (Plan 3).
  return { source: { kind: "html", files: { "index.html": html }, entry: "index.html" }, snapshot: false };
}
