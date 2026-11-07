import { describe, expect, it, vi } from "vitest";
import { toViews } from "./inspiration-shared";

const ROW = {
  id: "11111111-1111-4111-8111-111111111111",
  workspace_id: "22222222-2222-4222-8222-222222222222",
  status: "ready",
  storage_path: "22222222-2222-4222-8222-222222222222/11111111-1111-4111-8111-111111111111.png",
  mime_type: "image/png",
  width: 800,
  height: 600,
  source_url: "https://pinterest.com/pin/1",
  note: "nav",
  capture_channel: "shelf",
  created_at: "2026-11-06T10:00:00.000Z",
};

describe("toViews", () => {
  it("signs every path in one batch and reads room ids from the embedded links", async () => {
    const storage = {
      upload: vi.fn(),
      remove: vi.fn(),
      signUrls: vi.fn(async () => new Map([[ROW.storage_path, "https://signed/x"]])),
    };
    const views = await toViews([{ ...ROW, room_inspiration: [{ room_id: "33333333-3333-4333-8333-333333333333" }] }], storage);
    expect(storage.signUrls).toHaveBeenCalledWith([ROW.storage_path]);
    expect(views).toHaveLength(1);
    expect(views[0]?.imageUrl).toBe("https://signed/x");
    expect(views[0]?.roomIds).toEqual(["33333333-3333-4333-8333-333333333333"]);
  });

  it("maps a row to the camelCase view", async () => {
    const storage = {
      upload: vi.fn(),
      remove: vi.fn(),
      signUrls: vi.fn(async () => new Map([[ROW.storage_path, "https://signed/x"]])),
    };
    expect(await toViews([ROW], storage)).toEqual([
      {
        id: ROW.id,
        workspaceId: ROW.workspace_id,
        imageUrl: "https://signed/x",
        width: 800,
        height: 600,
        mimeType: "image/png",
        sourceUrl: "https://pinterest.com/pin/1",
        note: "nav",
        captureChannel: "shelf",
        createdAt: ROW.created_at,
        roomIds: [],
      },
    ]);
  });

  it("drops malformed rows instead of failing the page", async () => {
    const storage = { upload: vi.fn(), remove: vi.fn(), signUrls: vi.fn(async () => new Map()) };
    expect(await toViews([{ nope: true }, null, { ...ROW, mime_type: "image/gif" }], storage)).toEqual([]);
  });
});
