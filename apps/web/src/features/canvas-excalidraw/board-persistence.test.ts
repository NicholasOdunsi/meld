import { describe, expect, it, vi } from "vitest";
import { boardStorageKey, decodeBoard, encodeBoard, loadBoard, MAX_SAVED_BYTES, MAX_SCREEN_HTML_CHARS, saveBoard } from "./board-persistence";

const rect = { id: "r1", type: "rectangle", x: 1, y: 2, version: 3 };
const screen = { id: "welcome", rev: 1, html: "<p>hi</p>" };

describe("board persistence", () => {
  it("round-trips elements and screens and drops deleted elements", () => {
    const raw = encodeBoard([rect, { id: "gone", type: "ellipse", isDeleted: true }], [screen]);
    expect(decodeBoard(raw)).toEqual({ version: 1, elements: [rect], screens: [screen] });
  });

  it("persists a snapshot at the screen size limit", () => {
    const snapshot = { ...screen, html: "x".repeat(MAX_SCREEN_HTML_CHARS), snapshot: true as const };
    const stored = decodeBoard(encodeBoard([rect], [snapshot]))?.screens[0];
    expect(stored?.snapshot).toBe(true);
    expect(stored?.html.length).toBe(MAX_SCREEN_HTML_CHARS);
  });

  it("keys boards separately, with a default for no id", () => {
    expect(boardStorageKey("abc")).toBe("orion:canvas-excalidraw:abc");
    expect(boardStorageKey()).toBe("orion:canvas-excalidraw:local");
  });

  it("rejects missing, malformed, wrong-version and invalid data", () => {
    expect(decodeBoard(null)).toBeNull();
    expect(decodeBoard("not json")).toBeNull();
    expect(decodeBoard(JSON.stringify({ version: 2, elements: [], screens: [] }))).toBeNull();
    expect(decodeBoard(JSON.stringify({ version: 1, elements: "x", screens: [] }))).toBeNull();
    expect(decodeBoard(JSON.stringify({ version: 1, elements: [], screens: [{ id: "Bad Id", rev: 1, html: "x" }] }))).toBeNull();
    expect(decodeBoard(JSON.stringify({ version: 1, elements: [{ nope: 1 }], screens: [] }))).toBeNull();
  });

  it("rejects data over the size cap and refuses an oversized write", () => {
    expect(decodeBoard("x".repeat(MAX_SAVED_BYTES + 1))).toBeNull();
    expect(saveBoard({ setItem: vi.fn() }, "k", [rect], [{ ...screen, html: "x".repeat(MAX_SAVED_BYTES) }])).toBe(false);
  });

  it("loads through storage and reports failed reads and saves", () => {
    const stored = new Map<string, string>();
    const storage = { getItem: (k: string) => stored.get(k) ?? null, setItem: (k: string, v: string) => void stored.set(k, v) };
    expect(saveBoard(storage, "k", [rect], [screen])).toBe(true);
    expect(loadBoard(storage, "k")?.elements).toEqual([rect]);
    expect(loadBoard(storage, "missing")).toBeNull();
    expect(loadBoard({ getItem: () => { throw new Error("blocked"); } }, "k")).toBeNull();
    const full = { setItem: vi.fn(() => { throw new DOMException("full", "QuotaExceededError"); }) };
    expect(saveBoard(full, "k", [rect], [screen])).toBe(false);
  });
});
