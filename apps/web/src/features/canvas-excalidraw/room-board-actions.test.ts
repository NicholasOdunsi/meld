import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => true }));
vi.mock("@/lib/supabase/server", () => ({ createClient: vi.fn() }));

import { readRoomExcalidrawBoard, saveRoomExcalidrawBoard } from "./room-board-actions";

const room = () => crypto.randomUUID();
const rect = { id: "one", type: "rectangle", x: 42 };
const screen = { id: "welcome", rev: 1, html: "<h1>Welcome</h1>" };

describe("room board actions", () => {
  beforeEach(() => vi.clearAllMocks());

  it("starts empty, saves, and reopens the same room board", async () => {
    const id = room();
    expect(await readRoomExcalidrawBoard(id)).toEqual({ status: "ok", revision: 0, elements: [], screens: [] });
    expect(await saveRoomExcalidrawBoard(id, 0, [rect], [screen])).toEqual({ status: "saved", revision: 1 });
    expect(await readRoomExcalidrawBoard(id)).toEqual({ status: "ok", revision: 1, elements: [rect], screens: [screen] });
  });

  it("rejects stale writes without replacing newer work", async () => {
    const id = room();
    await saveRoomExcalidrawBoard(id, 0, [rect], [screen]);
    expect(await saveRoomExcalidrawBoard(id, 0, [], [])).toEqual({ status: "conflict", revision: 1 });
    expect((await readRoomExcalidrawBoard(id)).status).toBe("ok");
    expect(await saveRoomExcalidrawBoard(id, 1, [], [])).toEqual({ status: "saved", revision: 2 });
    expect(await readRoomExcalidrawBoard(id)).toEqual({ status: "ok", revision: 2, elements: [], screens: [] });
  });

  it("keeps boards separate and rejects invalid input", async () => {
    const first = room();
    const second = room();
    await saveRoomExcalidrawBoard(first, 0, [rect], []);
    expect(await readRoomExcalidrawBoard(second)).toEqual({ status: "ok", revision: 0, elements: [], screens: [] });
    expect(await saveRoomExcalidrawBoard("bad", 0, [], [])).toEqual({ status: "error" });
    expect(await saveRoomExcalidrawBoard(second, -1, [], [])).toEqual({ status: "error" });
    expect(await saveRoomExcalidrawBoard(second, 0, [], [{ id: "bad id", rev: 1, html: "x" }])).toEqual({ status: "error" });
  });

  it("shares demo boards across separately compiled server modules", async () => {
    const id = room();
    await saveRoomExcalidrawBoard(id, 0, [rect], [screen]);
    vi.resetModules();
    const reloaded = await import("./room-board-actions");
    expect(await reloaded.readRoomExcalidrawBoard(id)).toEqual({
      status: "ok", revision: 1, elements: [rect], screens: [screen],
    });
  });
});
