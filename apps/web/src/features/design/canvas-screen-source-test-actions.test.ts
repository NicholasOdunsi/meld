import { beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ enabled: true, fakeGetRoom: vi.fn() }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => mocks.enabled }));
vi.mock("@/features/rooms/e2e-fake", () => ({ fakeGetRoom: mocks.fakeGetRoom }));
import { fakeCreate, fakeSave } from "./canvas-screen-source-fake";
import { readCanvasEditTestState } from "./canvas-screen-source-test-actions";
const ROOM = "e4000000-0000-4000-8000-000000000001";
const source = { kind: "html" as const, entry: "index.html", files: { "index.html": "original" } };
beforeEach(() => { mocks.enabled = true; vi.clearAllMocks(); });
it("exposes the durable fake head and exact version count only to authenticated room editors", async () => {
  const created = fakeCreate(ROOM, source, "mobile");
  const save = fakeSave(created.screenId, created.versionId, { "index.html": "edited" }, [])!;
  mocks.fakeGetRoom.mockResolvedValue({currentUser:{id:"editor"},participants:[{userId:"editor",access:"edit"}]});
  expect(await readCanvasEditTestState(created.screenId)).toEqual({ status: "ok", versionId: save.versionId, versionCount: 2, source: { ...source, files: { "index.html": "edited" } } });
  expect(mocks.fakeGetRoom).toHaveBeenCalledWith(ROOM);
  mocks.fakeGetRoom.mockResolvedValue({currentUser:{id:"viewer"},participants:[{userId:"viewer",access:"view"}]});
  expect(await readCanvasEditTestState(created.screenId)).toEqual({ status: "error" });
});
it("rejects production, malformed IDs and missing authentication", async () => {
  const { screenId } = fakeCreate(ROOM, source, "mobile");
  mocks.enabled = false;
  expect(await readCanvasEditTestState(screenId)).toEqual({ status: "error" });
  expect(mocks.fakeGetRoom).not.toHaveBeenCalled();
  mocks.enabled = true;
  expect(await readCanvasEditTestState("bad")).toEqual({ status: "error" });
  expect(mocks.fakeGetRoom).not.toHaveBeenCalled();
  mocks.fakeGetRoom.mockRejectedValue(new Error("Authentication required"));
  expect(await readCanvasEditTestState(screenId)).toEqual({ status: "error" });
});
