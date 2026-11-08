// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import type { InspirationItemView } from "@meld/contracts";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(),
  listLibrary: vi.fn(),
  uploadInspirationFromWeb: vi.fn(),
  deleteInspirationItems: vi.fn(),
  linkInspirationToRoom: vi.fn(),
  updateInspirationNote: vi.fn(),
  prepareImageForUpload: vi.fn(),
}));
vi.mock("@astryxdesign/core/Toast", () => ({ useToast: () => mocks.toast }));
vi.mock("./inspiration-reader", () => ({ listLibrary: mocks.listLibrary }));
vi.mock("./inspiration-actions", () => ({
  uploadInspirationFromWeb: mocks.uploadInspirationFromWeb,
  deleteInspirationItems: mocks.deleteInspirationItems,
  linkInspirationToRoom: mocks.linkInspirationToRoom,
  updateInspirationNote: mocks.updateInspirationNote,
}));
vi.mock("./client-image-prep", () => ({ prepareImageForUpload: mocks.prepareImageForUpload }));

import { mergeFirstPage, useInspirationLibrary } from "./use-inspiration-library";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ROOM = { roomId: "33333333-3333-4333-8333-333333333333", roomName: "Login", projectName: "App" };

function item(id: string, createdAt = "2026-11-06T10:00:00.000Z"): InspirationItemView {
  return {
    id,
    workspaceId: WORKSPACE,
    imageUrl: `https://signed/${id}`,
    width: 1,
    height: 1,
    mimeType: "image/png",
    sourceUrl: null,
    note: null,
    captureChannel: "web",
    createdAt,
    roomIds: [],
  };
}

const A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

beforeEach(() => {
  vi.clearAllMocks();
  mocks.listLibrary.mockResolvedValue({ items: [item(A), item(B)], hasMore: false });
});

describe("mergeFirstPage", () => {
  it("replaces everything when the fresh page is the whole library", () => {
    expect(mergeFirstPage({ items: [item(B)], hasMore: false }, [item(A), item(B)])).toEqual([item(B)]);
  });

  it("keeps older loaded items beyond the fresh first page", () => {
    const fresh = { items: [item(A, "2026-11-06T12:00:00.000Z")], hasMore: true };
    const older = item(B, "2026-11-01T10:00:00.000Z");
    expect(mergeFirstPage(fresh, [older])).toEqual([fresh.items[0], older]);
  });
});

describe("useInspirationLibrary", () => {
  function setup() {
    return renderHook(() => useInspirationLibrary({ workspaceId: WORKSPACE, initialPage: { items: [item(A), item(B)], hasMore: false } }));
  }

  it("toggles and clears selection", () => {
    const { result } = setup();
    act(() => result.current.setSelected(A, true));
    expect([...result.current.selectedIds]).toEqual([A]);
    act(() => result.current.clearSelection());
    expect(result.current.selectedIds.size).toBe(0);
  });

  it("deletes the selection and tells the owner", async () => {
    mocks.deleteInspirationItems.mockResolvedValue({ status: "deleted", count: 1 });
    const { result } = setup();
    act(() => result.current.setSelected(A, true));
    await act(() => result.current.deleteSelected());
    expect(mocks.deleteInspirationItems).toHaveBeenCalledWith({ itemIds: [A] });
    expect(result.current.items.map((entry) => entry.id)).toEqual([B]);
    expect(mocks.toast).toHaveBeenCalledWith({ type: "info", body: "Deleted 1 image." });
  });

  it("adds the selection to a room and records the link locally", async () => {
    mocks.linkInspirationToRoom.mockResolvedValue({ status: "linked", count: 2 });
    const { result } = setup();
    act(() => {
      result.current.setSelected(A, true);
      result.current.setSelected(B, true);
    });
    await act(() => result.current.addSelectedToRoom(ROOM));
    expect(mocks.linkInspirationToRoom).toHaveBeenCalledWith({ roomId: ROOM.roomId, itemIds: [A, B] });
    expect(result.current.items.every((entry) => entry.roomIds.includes(ROOM.roomId))).toBe(true);
    expect(mocks.toast).toHaveBeenCalledWith({ type: "info", body: "Added 2 images to Login." });
  });

  it("uploads prepared files, reports failures by message, then refreshes", async () => {
    mocks.prepareImageForUpload
      .mockResolvedValueOnce({ ok: true, blob: new Blob([new Uint8Array([1])], { type: "image/png" }) })
      .mockResolvedValueOnce({ ok: false, message: "Only images can be saved." });
    mocks.uploadInspirationFromWeb.mockResolvedValue({ ok: false, error: "too_large" });
    const { result } = setup();
    await act(() =>
      result.current.uploadFiles([new File(["a"], "a.png", { type: "image/png" }), new File(["b"], "b.pdf")]),
    );
    expect(mocks.uploadInspirationFromWeb).toHaveBeenCalledTimes(1);
    const form = mocks.uploadInspirationFromWeb.mock.calls[0]?.[0] as FormData;
    expect(form.get("workspaceId")).toBe(WORKSPACE);
    expect(mocks.toast).toHaveBeenCalledWith({ type: "error", body: "Too large to save." });
    expect(mocks.toast).toHaveBeenCalledWith({ type: "error", body: "Only images can be saved." });
    expect(mocks.listLibrary).toHaveBeenCalledWith({ workspaceId: WORKSPACE, offset: 0 });
    expect(result.current.uploadingCount).toBe(0);
  });

  it("refreshes when the window regains focus (shelf saves show up)", async () => {
    setup();
    await act(async () => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(mocks.listLibrary).toHaveBeenCalledWith({ workspaceId: WORKSPACE, offset: 0 });
  });

  it("saves a note and updates it locally", async () => {
    mocks.updateInspirationNote.mockResolvedValue({ status: "saved", note: "hi" });
    const { result } = setup();
    await act(() => result.current.saveNote(A, " hi "));
    expect(result.current.items.find((entry) => entry.id === A)?.note).toBe("hi");
  });
});
