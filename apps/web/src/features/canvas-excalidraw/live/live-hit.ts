import { screenIdFromLink } from "../frame-link";

export type HitElement = { type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; link?: string | null };

const contains = (element: HitElement, point: { x: number; y: number }) =>
  point.x >= element.x && point.x <= element.x + element.width && point.y >= element.y && point.y <= element.y + element.height;

// Axis-aligned: Orion screens are never rotated by Orion, and a hand-rotated
// one simply needs a double-click nearer its middle.
export function screenFrameAt<T extends HitElement>(elements: readonly T[], point: { x: number; y: number }): { element: T; screenId: string } | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (element.isDeleted || element.type !== "embeddable" || !contains(element, point)) continue;
    const screenId = screenIdFromLink(element.link);
    if (screenId) return { element, screenId };
  }
  return null;
}

export function screenAt(elements: readonly HitElement[], point: { x: number; y: number }): string | null {
  return screenFrameAt(elements, point)?.screenId ?? null;
}

export function isInsideScreen(elements: readonly (HitElement & { id?: string })[], boardScreenId: string, point: { x: number; y: number }, frameId?: string): boolean {
  return elements.some((element) => !element.isDeleted && element.type === "embeddable"
    && (frameId === undefined || element.id === frameId)
    && screenIdFromLink(element.link) === boardScreenId && contains(element, point));
}
