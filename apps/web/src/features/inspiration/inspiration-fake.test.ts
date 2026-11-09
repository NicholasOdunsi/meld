import { beforeEach, describe, expect, it } from "vitest";
import {
  FAKE_INSPIRATION_ROOM,
  FAKE_SHELF_TOKEN,
  fakeDeleteItems,
  fakeLinkToRoom,
  fakeListLibrary,
  fakeListRoomInspiration,
  fakeRoomHasInspiration,
  fakeSaveInspiration,
  fakeSetLabel,
  fakeUnlinkFromRoom,
  resetInspirationFake,
} from "./inspiration-fake";
import { createFakeShelfLibrary } from "./shelf-library";

const WORKSPACE = "00000000-0000-4000-8000-000000000001";
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 1]);

beforeEach(() => resetInspirationFake());

describe("inspiration fake", () => {
  it("saves, dedupes, links, unlinks, and deletes like the real path", () => {
    const first = fakeSaveInspiration({ workspaceId: WORKSPACE, bytes: PNG, mimeType: "image/png" });
    const again = fakeSaveInspiration({ workspaceId: WORKSPACE, bytes: PNG, mimeType: "image/png" });
    expect(first).toMatchObject({ ok: true, duplicate: false });
    expect(again).toMatchObject({ ok: true, duplicate: true });
    if (!first.ok) throw new Error("expected ok");

    expect(fakeListLibrary({ workspaceId: WORKSPACE, offset: 0 }).items).toHaveLength(1);
    expect(fakeListLibrary({ workspaceId: WORKSPACE, offset: 0 }).items[0]?.imageUrl).toMatch(/^data:image\/png;base64,/);

    fakeLinkToRoom(FAKE_INSPIRATION_ROOM.roomId, [first.itemId]);
    expect(fakeRoomHasInspiration(FAKE_INSPIRATION_ROOM.roomId)).toBe(true);
    expect(fakeListRoomInspiration(FAKE_INSPIRATION_ROOM.roomId).map((item) => item.id)).toEqual([first.itemId]);

    fakeUnlinkFromRoom(FAKE_INSPIRATION_ROOM.roomId, [first.itemId]);
    expect(fakeRoomHasInspiration(FAKE_INSPIRATION_ROOM.roomId)).toBe(false);

    expect(fakeDeleteItems([first.itemId])).toBe(1);
    expect(fakeListLibrary({ workspaceId: WORKSPACE, offset: 0 }).items).toEqual([]);
  });
});

describe("fake shelf library", () => {
  const principal = {
    tokenId: "a0000000-0000-4000-8000-000000000000",
    userId: "a0000000-0000-4000-8000-000000000001",
    workspaceId: "00000000-0000-4000-8000-000000000001",
  };

  beforeEach(() => resetInspirationFake());

  it("keeps real dimensions and labels for the native wall", async () => {
    const saved = fakeSaveInspiration({ workspaceId: principal.workspaceId, bytes: new Uint8Array([1, 2, 3]), mimeType: "image/png", width: 800, height: 1200 });
    if (!saved.ok) throw new Error("save failed");
    fakeSetLabel(saved.itemId, "A tall mobile login.", "done");
    const page = await createFakeShelfLibrary(principal).list(0);
    expect(page.ok && page.value.items[0]).toMatchObject({ width: 800, height: 1200, description: "A tall mobile login.", labelState: "done" });
  });

  it("names a stable preview token", () => {
    expect(FAKE_SHELF_TOKEN).toBe("orion_cap_preview");
  });
});

