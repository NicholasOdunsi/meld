import { isFrameLink, screenIdFromLink } from "../frame-link";

type SelectableElement = { id: string; type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; link?: string | null };
export type SelectionKind = "shape" | "text" | "screen";
export type SelectionSummary = { kind: SelectionKind; ids: string[]; bounds: { x: number; y: number; width: number; height: number }; screenId: string | null };

export function describeSelection(
  elements: readonly SelectableElement[],
  selectedIds: Readonly<Record<string, true | boolean>>,
): SelectionSummary | null {
  const selected = elements.filter((element) => selectedIds[element.id] && !element.isDeleted);
  if (selected.length === 0) return null;
  const left = Math.min(...selected.map((element) => element.x));
  const top = Math.min(...selected.map((element) => element.y));
  const right = Math.max(...selected.map((element) => element.x + element.width));
  const bottom = Math.max(...selected.map((element) => element.y + element.height));
  const bounds = { x: left, y: top, width: right - left, height: bottom - top };
  const ids = selected.map((element) => element.id);
  const only = selected.length === 1 ? selected[0] : null;
  if (only?.type === "embeddable" && only.link && isFrameLink(only.link)) {
    return { kind: "screen", ids, bounds, screenId: screenIdFromLink(only.link) };
  }
  const kind: SelectionKind = selected.every((element) => element.type === "text") ? "text" : "shape";
  return { kind, ids, bounds, screenId: null };
}

// Excalidraw calls onChange after every one of its renders, and a parent re-render
// re-renders Excalidraw. Storing a fresh but equal summary would loop forever, so
// the board only updates its selection state when this says it changed.
export function sameSelection(a: SelectionSummary | null, b: SelectionSummary | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  return a.kind === b.kind && a.screenId === b.screenId
    && a.ids.length === b.ids.length && a.ids.every((id, index) => id === b.ids[index])
    && a.bounds.x === b.bounds.x && a.bounds.y === b.bounds.y
    && a.bounds.width === b.bounds.width && a.bounds.height === b.bounds.height;
}

export function sceneToContainer(point: { x: number; y: number }, view: { scrollX: number; scrollY: number; zoom: number }) {
  return { x: (point.x + view.scrollX) * view.zoom, y: (point.y + view.scrollY) * view.zoom };
}
