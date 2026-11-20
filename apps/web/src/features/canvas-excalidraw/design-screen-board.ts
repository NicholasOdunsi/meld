import { CaptureUpdateAction, newElementWith } from "@excalidraw/excalidraw";
import { frameSizeForFormFactor } from "@meld/prototype";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { boardScreenId } from "./board-screen-id";
import { addScreenFrame, FRAME_HEIGHT, FRAME_WIDTH, nextFramePosition } from "./board-actions";
import { frameLink } from "./frame-link";
import type { ScreenStore } from "./screen-store";

export type BoardDeps = {
  api: Pick<ExcalidrawImperativeAPI, "getSceneElements" | "getSceneElementsIncludingDeleted" | "updateScene" | "scrollToContent">;
  store: ScreenStore;
  reconcileConversions?: () => Promise<void>;
  loadDocument: (designScreenId: string) => Promise<{ html: string; formFactor: string } | null>;
};

export { boardScreenId };

function findFrame(deps: BoardDeps, designScreenId: string): ExcalidrawElement | null {
  const link = frameLink(boardScreenId(designScreenId));
  return deps.api.getSceneElements().find((element) => element.type === "embeddable" && element.link === link) ?? null;
}

export async function ensureDesignScreen(deps: BoardDeps, designScreenId: string): Promise<ExcalidrawElement | null> {
  await deps.reconcileConversions?.();
  const existing = findFrame(deps, designScreenId);
  if (existing) return existing;
  const loaded = await deps.loadDocument(designScreenId);
  if (!loaded) return null;
  // A focus command and the initial backfill can load the same document at once.
  const addedDuringLoad = findFrame(deps, designScreenId);
  if (addedDuringLoad) return addedDuringLoad;
  const id = boardScreenId(designScreenId);
  deps.store.set({ id, rev: (deps.store.get(id)?.rev ?? 0) + 1, html: loaded.html });
  const size = frameSizeForFormFactor(loaded.formFactor);
  // The frame is the screen's real device size, so nothing is cropped.
  return addScreenFrame(deps.api as ExcalidrawImperativeAPI, {
    screenId: id, ...nextFramePosition(deps.api as ExcalidrawImperativeAPI), width: size.w, height: size.h,
  });
}

// Frames added before screens were sized to their device were left at the
// 480x640 default, which crops a phone screen. Only that exact default is
// corrected; a size someone chose on purpose is never touched.
function fitLegacyFrame(deps: BoardDeps, element: ExcalidrawElement, formFactor: string): void {
  if (element.width !== FRAME_WIDTH || element.height !== FRAME_HEIGHT) return;
  const size = frameSizeForFormFactor(formFactor);
  if (size.w === FRAME_WIDTH && size.h === FRAME_HEIGHT) return;
  deps.api.updateScene({
    elements: deps.api.getSceneElementsIncludingDeleted().map((candidate) =>
      candidate.id === element.id ? newElementWith(candidate, { width: size.w, height: size.h }) : candidate),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}

export async function backfillDesignScreens(
  deps: BoardDeps,
  built: { id: string; formFactor: string }[],
): Promise<number> {
  await deps.reconcileConversions?.();
  let added = 0;
  for (const { id, formFactor } of built) {
    const existing = findFrame(deps, id);
    if (existing) { fitLegacyFrame(deps, existing, formFactor); continue; }
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

// The caller seeds the new cache and wraps publication in its room-local batch.
// Original cache keys stay alive until the room is released.
export function relinkConvertedFrames(deps: BoardDeps, from: string, to: string, publish: () => void): void {
    const original = frameLink(from), replacement = frameLink(to);
    const elements = deps.api.getSceneElementsIncludingDeleted().map(element => element.type === "embeddable" && element.link === original
        ? newElementWith(element, { link: replacement }) : element);
    publish();
    deps.api.updateScene({ elements, captureUpdate: CaptureUpdateAction.IMMEDIATELY });
}
export function formFactorForFrame(width: number, height: number): "mobile" | "tablet" | "desktop" {
    if (!Number.isFinite(width) || !Number.isFinite(height) || width <= 0 || height <= 0)
        return "mobile";
    const aspect = width / height;
    return (["mobile", "tablet", "desktop"] as const).reduce((best, candidate) => {
        const size = frameSizeForFormFactor(candidate), previous = frameSizeForFormFactor(best);
        return Math.abs(aspect - size.w / size.h) < Math.abs(aspect - previous.w / previous.h) ? candidate : best;
    }, "mobile" as "mobile" | "tablet" | "desktop");
}
