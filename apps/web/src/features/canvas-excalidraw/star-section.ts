import { CaptureUpdateAction, newElementWith, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { nextFramePosition } from "./board-actions";

const STAR_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const WIDTH = 960;
const HEIGHT = 640;

export function starSectionId(taskId: string): string | null {
  return STAR_ID.test(taskId) ? `star-section-${taskId.toLowerCase()}` : null;
}

export function findStarSection(elements: readonly ExcalidrawElement[], taskId: string): ExcalidrawElement | null {
  const id = starSectionId(taskId);
  return id ? elements.find((element) => element.id === id && !element.isDeleted && element.type === "frame") ?? null : null;
}

export function ensureStarSection(api: ExcalidrawImperativeAPI, taskId: string, title: string, strokeColor?: string): ExcalidrawElement | null {
  const id = starSectionId(taskId);
  if (!id) return null;
  const existing = findStarSection(api.getSceneElements(), taskId);
  if (existing) {
    if (!strokeColor || existing.strokeColor === strokeColor) return existing;
    const recolored = newElementWith(existing, { strokeColor });
    api.updateScene({ elements: api.getSceneElementsIncludingDeleted().map((element) => element.id === id ? recolored : element),
      captureUpdate: CaptureUpdateAction.IMMEDIATELY });
    return recolored;
  }
  const position = nextFramePosition(api);
  const [section] = restoreElements([{
    type: "frame", id, name: title.trim().slice(0, 120) || "Star", ...position,
    width: WIDTH, height: HEIGHT, strokeColor,
  } as unknown as ExcalidrawElement], null);
  api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted().filter((element) => element.id !== id), section],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY });
  return section;
}
