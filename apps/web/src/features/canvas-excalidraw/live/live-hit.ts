import { screenIdFromLink } from "../frame-link";

export type HitElement = { type: string; x: number; y: number; width: number; height: number; isDeleted?: boolean; link?: string | null };

const contains = (element: HitElement, point: { x: number; y: number }) =>
  point.x >= element.x && point.x <= element.x + element.width && point.y >= element.y && point.y <= element.y + element.height;

// Axis-aligned: Orion screens are never rotated by Orion, and a hand-rotated
// one simply needs a double-click nearer its middle.
export function screenAt(elements: readonly HitElement[], point: { x: number; y: number }): string | null {
  for (let index = elements.length - 1; index >= 0; index -= 1) {
    const element = elements[index];
    if (element.isDeleted || element.type !== "embeddable" || !contains(element, point)) continue;
    const screenId = screenIdFromLink(element.link);
    if (screenId) return screenId;
  }
  return null;
}

export function isInsideScreen(elements: readonly HitElement[], boardScreenId: string, point: { x: number; y: number }): boolean {
  return elements.some((element) => !element.isDeleted && element.type === "embeddable"
    && screenIdFromLink(element.link) === boardScreenId && contains(element, point));
}
