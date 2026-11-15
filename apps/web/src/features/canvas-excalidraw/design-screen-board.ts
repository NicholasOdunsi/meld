import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { addScreenFrame, nextFramePosition } from "./board-actions";
import { frameLink } from "./frame-link";
import type { ScreenStore } from "./screen-store";

export type BoardDeps = {
  api: Pick<ExcalidrawImperativeAPI, "getSceneElements" | "getSceneElementsIncludingDeleted" | "updateScene" | "scrollToContent">;
  store: ScreenStore;
  loadDocument: (designScreenId: string) => Promise<string | null>;
};

export function boardScreenId(designScreenId: string): string {
  return `ds-${designScreenId.toLowerCase()}`;
}

function findFrame(deps: BoardDeps, designScreenId: string): ExcalidrawElement | null {
  const link = frameLink(boardScreenId(designScreenId));
  return deps.api.getSceneElements().find((element) => element.type === "embeddable" && element.link === link) ?? null;
}

export async function ensureDesignScreen(deps: BoardDeps, designScreenId: string): Promise<ExcalidrawElement | null> {
  const existing = findFrame(deps, designScreenId);
  if (existing) return existing;
  const html = await deps.loadDocument(designScreenId);
  if (!html) return null;
  // A focus command and the initial backfill can load the same document at once.
  const addedDuringLoad = findFrame(deps, designScreenId);
  if (addedDuringLoad) return addedDuringLoad;
  const id = boardScreenId(designScreenId);
  deps.store.set({ id, rev: (deps.store.get(id)?.rev ?? 0) + 1, html });
  return addScreenFrame(deps.api as ExcalidrawImperativeAPI, { screenId: id, ...nextFramePosition(deps.api as ExcalidrawImperativeAPI) });
}

export async function backfillDesignScreens(deps: BoardDeps, builtIds: string[]): Promise<number> {
  let added = 0;
  for (const id of builtIds) {
    if (findFrame(deps, id)) continue;
    if (await ensureDesignScreen(deps, id)) added += 1;
  }
  return added;
}

export async function focusDesignScreen(deps: BoardDeps, designScreenId: string): Promise<boolean> {
  const element = await ensureDesignScreen(deps, designScreenId);
  if (!element) return false;
  requestAnimationFrame(() => {
    deps.api.scrollToContent([element], { fitToViewport: true, viewportZoomFactor: 0.8, animate: false });
  });
  return true;
}
