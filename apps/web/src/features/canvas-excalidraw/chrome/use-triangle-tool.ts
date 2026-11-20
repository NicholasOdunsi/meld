import { CaptureUpdateAction, convertToExcalidrawElements, newElementWith, viewportCoordsToSceneCoords } from "@excalidraw/excalidraw";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { useEffect } from "react";
import { MIN_DRAG, trianglePlacedAt, triangleFromDrag, type TriangleGeometry } from "./triangle";

const BODY_CLASS = "orion-triangle-tool";

// Draws a triangle where you drag, then hands you the selection tool so you can
// move it, resize it from its corners or reshape it from its points. Excalidraw
// has no triangle; the shape is a closed line (see triangle.ts).
//
// The drag is taken over in the capture phase so Excalidraw never starts its
// own gesture, and only while the Triangle tool is active.
export function useTriangleTool(api: ExcalidrawImperativeAPI | null, enabled: boolean, onDone: () => void): void {
  useEffect(() => {
    if (!api || !enabled) return;
    document.body.classList.add(BODY_CLASS);

    const createElement = (geometry: TriangleGeometry): ExcalidrawElement | null => {
      const style = api.getAppState();
      const [element] = convertToExcalidrawElements([{
        type: "line",
        ...geometry,
        strokeColor: style.currentItemStrokeColor,
        backgroundColor: style.currentItemBackgroundColor,
        strokeWidth: style.currentItemStrokeWidth,
        strokeStyle: style.currentItemStrokeStyle,
        roughness: style.currentItemRoughness,
        opacity: style.currentItemOpacity,
      }]);
      return element ?? null;
    };

    const onPointerDown = (event: PointerEvent) => {
      const canvas = event.target;
      if (event.button !== 0 || !(canvas instanceof HTMLCanvasElement) || !canvas.classList.contains("excalidraw__canvas") || !canvas.closest(".orion-board")) return;
      event.preventDefault();
      event.stopPropagation();
      // Taking over the click also skips Excalidraw's own focus handling; without
      // this, undo, Delete and the arrow keys would not work on the new triangle.
      canvas.closest<HTMLElement>(".excalidraw")?.focus();

      const startScreen = { x: event.clientX, y: event.clientY };
      const toScene = (clientX: number, clientY: number) => {
        const { x, y } = viewportCoordsToSceneCoords({ clientX, clientY }, api.getAppState());
        return { x, y };
      };
      const startScene = toScene(event.clientX, event.clientY);
      let id: string | null = null;
      let dragged = false;

      // The preview follows the drag without touching undo history.
      const preview = (geometry: TriangleGeometry) => {
        const scene = api.getSceneElementsIncludingDeleted();
        if (id === null) {
          const added = createElement(geometry);
          if (!added) return;
          id = added.id;
          api.updateScene({ elements: [...scene, added], captureUpdate: CaptureUpdateAction.NEVER });
          return;
        }
        const current = id;
        api.updateScene({
          elements: scene.map((element) => (element.id === current ? newElementWith(element, geometry as never) : element)),
          captureUpdate: CaptureUpdateAction.NEVER,
        });
      };
      // The finished triangle becomes one undo step. History records what a
      // change adds, so the preview is lifted off the board first and the
      // finished shape put back in a recorded update, selected.
      const commit = (geometry: TriangleGeometry) => {
        const scene = api.getSceneElementsIncludingDeleted();
        const current = id;
        const existing = current === null ? undefined : scene.find((element) => element.id === current);
        const finished = existing ? newElementWith(existing, geometry as never) : createElement(geometry);
        if (!finished) return;
        const rest = scene.filter((element) => element.id !== finished.id);
        if (existing) api.updateScene({ elements: rest, captureUpdate: CaptureUpdateAction.NEVER });
        api.updateScene({
          elements: [...rest, finished],
          appState: { selectedElementIds: { [finished.id]: true } },
          captureUpdate: CaptureUpdateAction.IMMEDIATELY,
        });
      };

      const onMove = (move: PointerEvent) => {
        if (!dragged && Math.hypot(move.clientX - startScreen.x, move.clientY - startScreen.y) < MIN_DRAG) return;
        dragged = true;
        const end = toScene(move.clientX, move.clientY);
        if (end.x === startScene.x || end.y === startScene.y) return;
        preview(triangleFromDrag(startScene, end));
      };
      const stop = () => {
        window.removeEventListener("pointermove", onMove, true);
        window.removeEventListener("pointerup", onUp, true);
        window.removeEventListener("pointercancel", onUp, true);
      };
      const onUp = (up: PointerEvent) => {
        stop();
        const end = toScene(up.clientX, up.clientY);
        const geometry = dragged && end.x !== startScene.x && end.y !== startScene.y ? triangleFromDrag(startScene, end) : trianglePlacedAt(startScene);
        api.setActiveTool({ type: "selection" });
        commit(geometry);
        onDone();
      };
      window.addEventListener("pointermove", onMove, true);
      window.addEventListener("pointerup", onUp, true);
      window.addEventListener("pointercancel", onUp, true);
    };

    document.addEventListener("pointerdown", onPointerDown, true);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown, true);
      document.body.classList.remove(BODY_CLASS);
    };
  }, [api, enabled, onDone]);
}
