import { describe, expect, it, vi } from "vitest";
import type { InspirationRepository } from "./inspiration-repository";
import type { InspirationStorage } from "./inspiration-storage";
import { saveInspirationItem } from "./save-inspiration-item";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ITEM = "11111111-1111-4111-8111-111111111111";
const ROOM = "33333333-3333-4333-8333-333333333333";

function pngHeader(width: number, height: number): Uint8Array {
  const bytes = new Uint8Array(33);
  bytes.set([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a], 0);
  bytes.set([0, 0, 0, 13, 0x49, 0x48, 0x44, 0x52], 8);
  const view = new DataView(bytes.buffer);
  view.setUint32(16, width);
  view.setUint32(20, height);
  return bytes;
}

function row(status: "pending" | "ready") {
  return {
    id: ITEM,
    workspace_id: WORKSPACE,
    status,
    storage_path: `${WORKSPACE}/${ITEM}.png`,
    mime_type: "image/png" as const,
    width: 2,
    height: 3,
    source_url: null,
    note: null,
    capture_channel: "web" as const,
    created_at: "2026-11-06T10:00:00.000Z",
  };
}

function deps(options: { duplicate?: boolean; uploadFails?: boolean; linkFails?: boolean } = {}) {
  const repository: InspirationRepository = {
    createIntent: vi.fn(async () => ({ item: row(options.duplicate ? "ready" : "pending"), duplicate: Boolean(options.duplicate) })),
    finalize: vi.fn(async () => undefined),
    fail: vi.fn(async () => undefined),
    linkToRoom: vi.fn(async () => {
      if (options.linkFails) throw new Error("not_authorized");
      return 1;
    }),
  };
  const storage: InspirationStorage = {
    upload: vi.fn(async () => {
      if (options.uploadFails) throw new Error("Inspiration upload failed");
    }),
    remove: vi.fn(async () => undefined),
    signUrls: vi.fn(async () => new Map()),
  };
  return { repository, storage };
}

const INPUT = {
  workspaceId: WORKSPACE,
  bytes: pngHeader(2, 3),
  note: "nav",
  sourceUrl: null,
  roomId: null,
  channel: "web" as const,
};

describe("saveInspirationItem", () => {
  it("creates an intent from server-measured values, uploads, then finalizes", async () => {
    const d = deps();
    const result = await saveInspirationItem(INPUT, d);
    expect(result).toEqual({ ok: true, itemId: ITEM, duplicate: false, roomLinked: false });
    expect(d.repository.createIntent).toHaveBeenCalledWith(
      expect.objectContaining({ workspaceId: WORKSPACE, mimeType: "image/png", width: 2, height: 3, note: "nav", channel: "web" }),
    );
    expect(d.storage.upload).toHaveBeenCalledWith(`${WORKSPACE}/${ITEM}.png`, INPUT.bytes, "image/png");
    expect(d.repository.finalize).toHaveBeenCalledWith(ITEM);
  });

  it("does not upload a duplicate", async () => {
    const d = deps({ duplicate: true });
    expect(await saveInspirationItem(INPUT, d)).toEqual({ ok: true, itemId: ITEM, duplicate: true, roomLinked: false });
    expect(d.storage.upload).not.toHaveBeenCalled();
    expect(d.repository.finalize).not.toHaveBeenCalled();
  });

  it("marks the item failed and reports unavailable when the upload fails", async () => {
    const d = deps({ uploadFails: true });
    expect(await saveInspirationItem(INPUT, d)).toEqual({ ok: false, error: "unavailable" });
    expect(d.repository.fail).toHaveBeenCalledWith(ITEM);
    expect(d.repository.finalize).not.toHaveBeenCalled();
  });

  it("links to the room after finalizing, also for duplicates", async () => {
    for (const duplicate of [false, true]) {
      const d = deps({ duplicate });
      expect(await saveInspirationItem({ ...INPUT, roomId: ROOM }, d)).toMatchObject({ ok: true, roomLinked: true });
      expect(d.repository.linkToRoom).toHaveBeenCalledWith(ROOM, [ITEM]);
    }
  });

  it("still saves the image when the room link fails", async () => {
    const d = deps({ linkFails: true });
    expect(await saveInspirationItem({ ...INPUT, roomId: ROOM }, d)).toEqual({
      ok: true,
      itemId: ITEM,
      duplicate: false,
      roomLinked: false,
    });
  });

  it("returns the validation error without touching the database", async () => {
    const d = deps();
    expect(await saveInspirationItem({ ...INPUT, bytes: new TextEncoder().encode("nope") }, d)).toEqual({
      ok: false,
      error: "unsupported_type",
    });
    expect(d.repository.createIntent).not.toHaveBeenCalled();
  });

  it("reports unavailable when the intent RPC throws", async () => {
    const d = deps();
    vi.mocked(d.repository.createIntent).mockRejectedValueOnce(new Error("boom"));
    expect(await saveInspirationItem(INPUT, d)).toEqual({ ok: false, error: "unavailable" });
  });
});
