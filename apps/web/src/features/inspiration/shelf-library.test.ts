import { beforeEach, describe, expect, it, vi } from "vitest";

const storage = vi.hoisted(() => ({ signUrls: vi.fn(), remove: vi.fn(), upload: vi.fn() }));
vi.mock("./inspiration-storage", () => ({ createInspirationStorage: () => storage }));

import { createShelfLibrary } from "./shelf-library";

const PRINCIPAL = {
  tokenId: "11111111-1111-4111-8111-111111111111",
  userId: "22222222-2222-4222-8222-222222222222",
  workspaceId: "33333333-3333-4333-8333-333333333333",
};
const ITEM_ID = "44444444-4444-4444-8444-444444444444";
const ROOM_ID = "55555555-5555-4555-8555-555555555555";
const ROW = {
  id: ITEM_ID,
  width: 400,
  height: 300,
  mime_type: "image/png",
  note: "nice",
  source_url: null,
  created_at: "2026-11-09T14:02:00.123456+00:00",
  storage_path: `${PRINCIPAL.workspaceId}/a.png`,
  label_status: "sorted",
  description: "Pricing cards.",
  rooms: [{ room_id: ROOM_ID, room_name: "Main", project_name: "Voxecore" }],
};

function client(rpc: ReturnType<typeof vi.fn>) {
  return { rpc } as never;
}

describe("createShelfLibrary", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    storage.signUrls.mockResolvedValue(new Map([[ROW.storage_path, "https://signed/a"]]));
    storage.remove.mockResolvedValue(undefined);
  });

  it("lists a page with signed urls, label state and rooms", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [ROW], error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).list(0);
    expect(rpc).toHaveBeenCalledWith("capture_list_inspiration", {
      actor_user_id: PRINCIPAL.userId,
      target_workspace_id: PRINCIPAL.workspaceId,
      page_offset: 0,
      page_limit: 101,
    });
    expect(result).toEqual({
      ok: true,
      value: {
        items: [
          {
            id: ITEM_ID,
            width: 400,
            height: 300,
            mimeType: "image/png",
            note: "nice",
            sourceUrl: null,
            createdAt: "2026-11-09T14:02:00.123Z",
            description: "Pricing cards.",
            labelState: "done",
            rooms: [{ roomId: ROOM_ID, roomName: "Main", projectName: "Voxecore" }],
            imageUrl: "https://signed/a",
          },
        ],
        nextOffset: null,
      },
    });
  });

  it("maps label status to label state", async () => {
    const rows = [
      { ...ROW, id: "a0000000-0000-4000-8000-000000000001", label_status: null, description: null },
      { ...ROW, id: "a0000000-0000-4000-8000-000000000002", label_status: "unsorted", description: null },
      { ...ROW, id: "a0000000-0000-4000-8000-000000000003", label_status: "unsortable", description: null },
    ];
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).list(0);
    expect(result.ok && result.value.items.map((item) => item.labelState)).toEqual(["pending", "pending", "skipped"]);
  });

  it("reports a next offset when one extra row comes back", async () => {
    const rows = Array.from({ length: 101 }, (_, i) => ({ ...ROW, id: `b0000000-0000-4000-8000-${String(i).padStart(12, "0")}` }));
    const rpc = vi.fn().mockResolvedValue({ data: rows, error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).list(100);
    expect(result.ok && result.value.items).toHaveLength(100);
    expect(result.ok && result.value.nextOffset).toBe(200);
  });

  it("maps not_authorized to unauthorized", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "not_authorized" } });
    expect(await createShelfLibrary(client(rpc), PRINCIPAL).list(0)).toEqual({ ok: false, error: "unauthorized" });
  });

  it("updates a note and returns the fresh item", async () => {
    const rpc = vi
      .fn()
      .mockResolvedValueOnce({ data: null, error: null })
      .mockResolvedValueOnce({ data: [{ ...ROW, note: "fresh" }], error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).updateNote(ITEM_ID, "fresh");
    expect(rpc).toHaveBeenNthCalledWith(1, "capture_update_inspiration_note", {
      actor_user_id: PRINCIPAL.userId,
      target_workspace_id: PRINCIPAL.workspaceId,
      target_item_id: ITEM_ID,
      item_note: "fresh",
    });
    expect(result.ok && result.value.note).toBe("fresh");
  });

  it("maps a missing note target to not_found", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: null, error: { message: "not_found" } });
    expect(await createShelfLibrary(client(rpc), PRINCIPAL).updateNote(ITEM_ID, "x")).toEqual({ ok: false, error: "not_found" });
  });

  it("deletes rows then removes their objects", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: [ROW.storage_path], error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).remove([ITEM_ID]);
    expect(rpc).toHaveBeenCalledWith("capture_delete_inspiration_items", {
      actor_user_id: PRINCIPAL.userId,
      target_workspace_id: PRINCIPAL.workspaceId,
      target_item_ids: [ITEM_ID],
    });
    expect(storage.remove).toHaveBeenCalledWith([ROW.storage_path]);
    expect(result).toEqual({ ok: true, value: { count: 1 } });
  });

  it("links items to a room", async () => {
    const rpc = vi.fn().mockResolvedValue({ data: 2, error: null });
    const result = await createShelfLibrary(client(rpc), PRINCIPAL).addToRoom([ITEM_ID], ROOM_ID);
    expect(rpc).toHaveBeenCalledWith("capture_link_inspiration_items", {
      actor_user_id: PRINCIPAL.userId,
      target_workspace_id: PRINCIPAL.workspaceId,
      target_room_id: ROOM_ID,
      target_item_ids: [ITEM_ID],
    });
    expect(result).toEqual({ ok: true, value: { count: 2 } });
  });
});
