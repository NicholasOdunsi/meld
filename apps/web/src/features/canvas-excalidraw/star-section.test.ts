import { describe, expect, it, vi } from "vitest";
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "immediately" },
  restoreElements: (elements: unknown[]) => elements,
  newElementWith: (element: object, changes: object) => ({ ...element, ...changes }),
}));
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
import type { ExcalidrawImperativeAPI } from "@excalidraw/excalidraw/types";
import { ensureStarSection, findStarSection, starSectionId } from "./star-section";

const taskId = "40000000-0000-4000-8000-000000000001";

describe("Star sections", () => {
  it("uses a stable ID and rejects malformed task IDs", () => {
    expect(starSectionId(taskId)).toBe(`star-section-${taskId}`);
    expect(starSectionId("not-a-task")).toBeNull();
  });

  it("finds only a live frame for that Star", () => {
    const id = starSectionId(taskId);
    const elements = [
      { id, type: "rectangle", isDeleted: false },
      { id, type: "frame", isDeleted: true },
      { id, type: "frame", isDeleted: false },
    ] as ExcalidrawElement[];
    expect(findStarSection(elements, taskId)).toBe(elements[2]);
    expect(findStarSection(elements, "bad")).toBeNull();
  });

  it("creates one named section and focuses the same section on a second call", () => {
    let elements: ExcalidrawElement[] = [];
    const api = {
      getSceneElements: () => elements.filter((element) => !element.isDeleted),
      getSceneElementsIncludingDeleted: () => elements,
      updateScene: (scene: { elements: ExcalidrawElement[] }) => { elements = scene.elements; },
    } as unknown as ExcalidrawImperativeAPI;
    const first = ensureStarSection(api, taskId, "Checkout redesign");
    const second = ensureStarSection(api, taskId, "Renamed later");
    expect(first?.id).toBe(starSectionId(taskId));
    expect(first?.type).toBe("frame");
    expect(elements).toHaveLength(1);
    expect(second).toBe(first);
  });
});
