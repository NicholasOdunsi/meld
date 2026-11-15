import { exportToBlob, getDataURL } from "@excalidraw/excalidraw";
import type { ExcalidrawElement, ExcalidrawFrameLikeElement, ExcalidrawTextElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import type { SketchRequest } from "./sketch-request";

// What the model sees: an image of the frame plus the shapes inside it.
export async function collectSketch(
  api: ExcalidrawImperativeAPI,
  frame: ExcalidrawFrameLikeElement,
): Promise<SketchRequest> {
  const elements = api.getSceneElements();
  const children = elements.filter((element) => element.frameId === frame.id);
  const geometry = children.map((element: ExcalidrawElement) => ({
    type: element.type,
    x: Math.round(element.x - frame.x),
    y: Math.round(element.y - frame.y),
    width: Math.round(element.width),
    height: Math.round(element.height),
    ...(element.type === "text" ? { text: (element as ExcalidrawTextElement).text.slice(0, 500) } : {}),
  }));
  const blob = await exportToBlob({
    elements,
    appState: { exportBackground: true, viewBackgroundColor: "white" },
    files: api.getFiles(),
    mimeType: "image/png",
    exportingFrame: frame,
    maxWidthOrHeight: 1024,
  });
  return {
    width: Math.max(100, Math.round(frame.width)),
    height: Math.max(100, Math.round(frame.height)),
    geometry: geometry.slice(0, 500),
    imageDataUrl: await getDataURL(blob),
  };
}
