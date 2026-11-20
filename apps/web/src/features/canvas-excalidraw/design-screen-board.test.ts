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
import { backfillDesignScreens, relinkConvertedFrames, formFactorForFrame, boardScreenId, ensureDesignScreen, focusDesignScreen, type BoardDeps } from "./design-screen-board";

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

it("relinks every shared source frame as one scene update without changing geometry or arrows", async () => {
    const board = deps(async () => doc());
    const original = { id: "frame-one", type: "embeddable", link: frameLink("old"), x: 12, y: 34, width: 390, height: 844, groupIds: ["g"], boundElements: [{ type: "arrow", id: "arrow" }], isDeleted: false };
    const second = { ...original, id: "frame-two", x: 900 };
    const arrow = { id: "arrow", type: "arrow", startBinding: { elementId: "frame-one" } };
    board.elements.push(original as unknown as ExcalidrawElement, second as unknown as ExcalidrawElement, arrow as unknown as ExcalidrawElement);
    const before = [...board.elements];
    const publish = vi.fn();
    relinkConvertedFrames(board, "old", boardScreenId(A), publish);
    expect(publish).toHaveBeenCalledOnce();
    expect(board.api.updateScene).toHaveBeenCalledOnce();
    expect(board.elements).toEqual(before.map((element, index) => index < 2 ? { ...element, link: frameLink(boardScreenId(A)) } : element));
    expect(board.elements[2]).toBe(arrow);
    expect(await backfillDesignScreens(board, [{ id: A, formFactor: "mobile" }])).toBe(0);
    expect(board.elements.filter(e => e.type === "embeddable")).toHaveLength(2);
});
it("waits for conversion reconciliation before any load and fails closed on lookup failure", async () => {
    const load = vi.fn(async () => doc());
    const board = deps(load);
    board.reconcileConversions = vi.fn().mockRejectedValue(new Error("mapping unavailable"));
    await expect(backfillDesignScreens(board, [{ id: A, formFactor: "mobile" }])).rejects.toThrow("mapping unavailable");
    expect(load).not.toHaveBeenCalled();
    expect(board.api.updateScene).not.toHaveBeenCalled();
    board.elements.push({ id: "old", type: "embeddable", link: frameLink("old"), width: 390, height: 844 } as ExcalidrawElement);
    board.reconcileConversions = vi.fn(async () => {
        relinkConvertedFrames(board, "old", boardScreenId(A), () => {
        });
    });
    expect(await backfillDesignScreens(board, [{ id: A, formFactor: "mobile" }])).toBe(0);
    expect(load).not.toHaveBeenCalled();
    expect(board.elements).toHaveLength(1);
});
it("uses presets or nearest custom aspect ratio for conversion device", () => {
    expect(formFactorForFrame(390, 844)).toBe("mobile");
    expect(formFactorForFrame(834, 1112)).toBe("tablet");
    expect(formFactorForFrame(1280, 832)).toBe("desktop");
    expect(formFactorForFrame(1000, 650)).toBe("desktop");
    expect(formFactorForFrame(0, 0)).toBe("mobile");
});
