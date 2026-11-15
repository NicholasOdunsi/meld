import { CaptureUpdateAction, newElementWith, restoreElements } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { frameLink } from "./frame-link";

export const FRAME_WIDTH = 480;
export const FRAME_HEIGHT = 640;
const GAP = 80;

export function nextFramePosition(api: ExcalidrawImperativeAPI): { x: number; y: number } {
  const right = api.getSceneElements().reduce((max, element) => Math.max(max, element.x + element.width), -GAP);
  return { x: right + GAP, y: 0 };
}

// An embeddable whose link names a screen; its page is drawn by FrameHost.
export function addScreenFrame(
  api: ExcalidrawImperativeAPI,
  input: { screenId: string; x: number; y: number; width?: number; height?: number },
): ExcalidrawElement {
  const [element] = restoreElements(
    [{
      type: "embeddable",
      id: `frame-${crypto.randomUUID()}`,
      x: input.x,
      y: input.y,
      width: input.width ?? FRAME_WIDTH,
      height: input.height ?? FRAME_HEIGHT,
      link: frameLink(input.screenId),
    } as unknown as ExcalidrawElement],
    null,
  );
  api.updateScene({
    elements: [...api.getSceneElementsIncludingDeleted(), element],
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
  return element;
}

export function navigateFrame(api: ExcalidrawImperativeAPI, elementId: string, screenId: string): void {
  api.updateScene({
    elements: api
      .getSceneElementsIncludingDeleted()
      .map((element) => (element.id === elementId ? newElementWith(element, { link: frameLink(screenId) }) : element)),
    captureUpdate: CaptureUpdateAction.IMMEDIATELY,
  });
}
