// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { ExcalidrawElement } from "@excalidraw/excalidraw/element/types";
vi.mock("@excalidraw/excalidraw", () => ({
  CaptureUpdateAction: { IMMEDIATELY: "immediately" },
  restoreElements: (elements: unknown[]) => elements,
  newElementWith: (element: object, patch: object) => ({ ...element, ...patch }),
}));
import { createScreenStore } from "./screen-store";
import { frameLink } from "./frame-link";
import { FRAME_HEIGHT, FRAME_WIDTH } from "./board-actions";
import { backfillDesignScreens, boardScreenId, ensureDesignScreen, focusDesignScreen, type BoardDeps } from "./design-screen-board";

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";
const doc = (formFactor = "mobile") => ({ html: "<html>screen</html>", formFactor });

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
    const load = vi.fn(async () => doc());
    const board = deps(load);
    const first = await ensureDesignScreen(board, A);
    const second = await ensureDesignScreen(board, A);
    expect(first?.id).toBe(second?.id);
    expect(board.elements).toHaveLength(1);
    expect(load).toHaveBeenCalledTimes(1);
    expect(board.store.get(boardScreenId(A))?.html).toBe("<html>screen</html>");
  });

  it("backfills only missing screens and focuses a built frame", async () => {
    const board = deps(async () => doc());
    await ensureDesignScreen(board, A);
    expect(await backfillDesignScreens(board, [{ id: A, formFactor: "mobile" }, { id: B, formFactor: "mobile" }])).toBe(1);
    expect(await backfillDesignScreens(board, [{ id: A, formFactor: "mobile" }, { id: B, formFactor: "mobile" }])).toBe(0);
    expect(board.elements).toHaveLength(2);
    expect(await focusDesignScreen(board, B)).toBe(true);
    expect(board.api.scrollToContent).toHaveBeenCalledTimes(1);
  });

  it("focuses an existing frame without a new document load", async () => {
    const board = deps(async () => doc());
    await backfillDesignScreens(board, [{ id: A, formFactor: "mobile" }]);
    board.loadDocument = vi.fn(async () => null);
    expect(await focusDesignScreen(board, A)).toBe(true);
    expect(board.loadDocument).not.toHaveBeenCalled();
    expect(board.elements).toHaveLength(1);
  });

  it("does not add a frame when the screen is unavailable", async () => {
    const board = deps(async () => null);
    expect(await ensureDesignScreen(board, A)).toBeNull();
    expect(board.elements).toHaveLength(0);
  });

  it("draws each screen at its real device size, not a cropped default", async () => {
    const mobile = deps(async () => doc("mobile"));
    expect(await ensureDesignScreen(mobile, A)).toMatchObject({ width: 390, height: 844 });
    const tablet = deps(async () => doc("tablet"));
    expect(await ensureDesignScreen(tablet, A)).toMatchObject({ width: 834, height: 1112 });
    const desktop = deps(async () => doc("desktop"));
    expect(await ensureDesignScreen(desktop, A)).toMatchObject({ width: 1280, height: 832 });
  });

  it("resizes an earlier frame that was left at the old 480x640 default, and nothing else", async () => {
    const board = deps(async () => doc());
    const old = await ensureDesignScreen(board, A);
    board.elements.splice(0, 1, { ...old!, width: FRAME_WIDTH, height: FRAME_HEIGHT } as ExcalidrawElement);
    await backfillDesignScreens(board, [{ id: A, formFactor: "mobile" }]);
    expect(board.elements[0]).toMatchObject({ width: 390, height: 844 });
    // A size someone chose on purpose is left alone.
    board.elements.splice(0, 1, { ...board.elements[0], width: 500, height: 700 } as ExcalidrawElement);
    await backfillDesignScreens(board, [{ id: A, formFactor: "mobile" }]);
    expect(board.elements[0]).toMatchObject({ width: 500, height: 700 });
  });
});
