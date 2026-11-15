// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "immediately" },
  restoreElements: (elements: unknown[]) => elements,
}));
import { createScreenStore } from "./screen-store";
import { frameLink } from "./frame-link";
import { backfillDesignScreens, boardScreenId, ensureDesignScreen, focusDesignScreen, type BoardDeps } from "./design-screen-board";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

function deps(loadDocument: BoardDeps["loadDocument"]): BoardDeps & { elements: ExcalidrawElement[] } {
  const elements: ExcalidrawElement[] = [];
  return {
    elements,
    store: createScreenStore(),
    loadDocument,
    api: {
      getSceneElements: () => elements.filter((element) => !element.isDeleted),
      getSceneElementsIncludingDeleted: () => elements,
      updateScene: vi.fn((scene: { elements?: ExcalidrawElement[] }) => {
        if (scene.elements) elements.splice(0, elements.length, ...scene.elements);
      }),
      scrollToContent: vi.fn(),
    } as unknown as BoardDeps["api"],
  };
}

beforeEach(() => { vi.stubGlobal("requestAnimationFrame", (callback: FrameRequestCallback) => callback(0)); });

describe("built design screens on the board", () => {
  it("uses a valid and stable board link", () => {
    expect(boardScreenId(A.toUpperCase())).toBe(`ds-${A}`);
    expect(frameLink(boardScreenId(A))).toBe(`orion-screen://ds-${A}`);
  });

  it("adds a document once and finds the existing frame", async () => {
    const load = vi.fn(async () => "<html>screen</html>");
    const board = deps(load);
    const first = await ensureDesignScreen(board, A);
    const second = await ensureDesignScreen(board, A);
    expect(first?.id).toBe(second?.id);
    expect(board.elements).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(board.store.get(boardScreenId(A))?.html).toBe("<html>screen</html>");
  });

  it("backfills only missing screens and focuses a built frame", async () => {
    const board = deps(async () => "<html>screen</html>");
    await ensureDesignScreen(board, A);
    expect(await backfillDesignScreens(board, [A, B])).toBe(1);
    expect(await backfillDesignScreens(board, [A, B])).toBe(0);
    expect(board.elements).toHaveLength(2);
    expect(await focusDesignScreen(board, B)).toBe(true);
    expect(board.api.scrollToContent).toHaveBeenCalledTimes(1);
  });

  it("does not add a frame when the screen is unavailable", async () => {
    const board = deps(async () => null);
    expect(await ensureDesignScreen(board, A)).toBeNull();
    expect(board.elements).toHaveLength(0);
  });
});
