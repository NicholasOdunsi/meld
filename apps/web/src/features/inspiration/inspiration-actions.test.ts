import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  isRoomFakeEnabled: vi.fn(() => false),
  saveInspirationItem: vi.fn(),
  rpc: vi.fn(),
  remove: vi.fn(async () => ({ error: null })),
}));
const schedule = vi.hoisted(() => vi.fn());
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: mocks.isRoomFakeEnabled }));
vi.mock("./save-inspiration-item", () => ({ saveInspirationItem: mocks.saveInspirationItem }));
vi.mock("./sorting/schedule-inspiration-sort", () => ({ scheduleInspirationSort: schedule }));

import {
  deleteInspirationItems,
  linkInspirationToRoom,
  unlinkInspirationFromRoom,
  updateInspirationNote,
  uploadInspirationFromWeb,
} from "./inspiration-actions";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ROOM = "33333333-3333-4333-8333-333333333333";
const ITEM = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.createClient.mockResolvedValue({ rpc: mocks.rpc, storage: { from: () => ({ remove: mocks.remove }) } });
});

describe("uploadInspirationFromWeb", () => {
  it("saves through the one write path with channel web", async () => {
    mocks.saveInspirationItem.mockResolvedValue({ ok: true, itemId: ITEM, duplicate: false, roomLinked: false });
    const form = new FormData();
    form.set("workspaceId", WORKSPACE);
    form.set("file", new Blob([new Uint8Array([1, 2])], { type: "image/png" }), "a.png");
    expect(await uploadInspirationFromWeb(form)).toEqual({ ok: true, itemId: ITEM, duplicate: false, roomLinked: false });
    expect(mocks.saveInspirationItem).toHaveBeenCalledWith(
      { workspaceId: WORKSPACE, bytes: new Uint8Array([1, 2]), note: null, sourceUrl: null, roomId: null, channel: "web" },
      expect.objectContaining({ repository: expect.anything(), storage: expect.anything() }),
    );
    expect(schedule).toHaveBeenCalledTimes(1);
    expect(schedule).toHaveBeenCalledWith(WORKSPACE);
  });

  it("rejects a missing file or workspace without saving", async () => {
    const form = new FormData();
    form.set("workspaceId", WORKSPACE);
    expect(await uploadInspirationFromWeb(form)).toEqual({ ok: false, error: "invalid_image" });
    expect(mocks.saveInspirationItem).not.toHaveBeenCalled();
  });
});

describe("updateInspirationNote", () => {
  it("saves a normalized note", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: null });
    expect(await updateInspirationNote({ itemId: ITEM, note: "  hi " })).toEqual({ status: "saved", note: "hi" });
    expect(mocks.rpc).toHaveBeenCalledWith("update_inspiration_note", { target_item_id: ITEM, item_note: "hi" });
  });

  it("reports an RPC error", async () => {
    mocks.rpc.mockResolvedValue({ data: null, error: { message: "not_found" } });
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await updateInspirationNote({ itemId: ITEM, note: "x" })).toEqual({ status: "error" });
  });
});

describe("deleteInspirationItems", () => {
  it("deletes rows, then removes their storage objects", async () => {
    mocks.rpc.mockResolvedValue({ data: [`${WORKSPACE}/${ITEM}.png`], error: null });
    expect(await deleteInspirationItems({ itemIds: [ITEM] })).toEqual({ status: "deleted", count: 1 });
    expect(mocks.rpc).toHaveBeenCalledWith("delete_inspiration_items", { target_item_ids: [ITEM] });
    expect(mocks.remove).toHaveBeenCalledWith([`${WORKSPACE}/${ITEM}.png`]);
  });

  it("refuses more than the bulk limit", async () => {
    const ids = Array.from({ length: 101 }, () => ITEM);
    expect(await deleteInspirationItems({ itemIds: ids })).toEqual({ status: "error" });
    expect(mocks.rpc).not.toHaveBeenCalled();
  });
});

describe("room links", () => {
  it("links and unlinks through the session RPCs", async () => {
    mocks.rpc.mockResolvedValue({ data: 1, error: null });
    expect(await linkInspirationToRoom({ roomId: ROOM, itemIds: [ITEM] })).toEqual({ status: "linked", count: 1 });
    expect(await unlinkInspirationFromRoom({ roomId: ROOM, itemIds: [ITEM] })).toEqual({ status: "unlinked", count: 1 });
    expect(mocks.rpc).toHaveBeenNthCalledWith(1, "link_inspiration_to_room", { target_room_id: ROOM, target_item_ids: [ITEM] });
    expect(mocks.rpc).toHaveBeenNthCalledWith(2, "unlink_inspiration_from_room", { target_room_id: ROOM, target_item_ids: [ITEM] });
  });
});
