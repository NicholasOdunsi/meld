import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  createClient: vi.fn(),
  fetchFigmaOEmbed: vi.fn(),
  downloadCappedImage: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/design/figma-oembed", () => ({
  fetchFigmaOEmbed: mocks.fetchFigmaOEmbed,
  downloadCappedImage: mocks.downloadCappedImage,
}));

import {
  recordFigmaReferences,
  refreshDesignReference,
  removeDesignReference,
} from "./design-references-actions";

const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const REFERENCE_ID = "80000000-0000-4000-8000-000000000008";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("recordFigmaReferences", () => {
  it("calls add_design_reference once per unique Figma URL, status pending", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });

    await recordFigmaReferences({
      roomId: ROOM_ID,
      body:
        "see https://figma.com/design/a?node-id=1-2 and https://figma.com/design/a?node-id=1-2 and https://x.com/y",
    });

    expect(rpc).toHaveBeenCalledTimes(1);
    expect(rpc).toHaveBeenCalledWith("add_design_reference", {
      target_room_id: ROOM_ID,
      url: "https://figma.com/design/a?node-id=1-2",
      ref_title: null,
      thumb: null,
      status: "pending",
    });
  });

  it("calls add_design_reference for each of multiple distinct Figma URLs", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });

    await recordFigmaReferences({
      roomId: ROOM_ID,
      body: "https://figma.com/design/a and https://figma.com/design/b",
    });

    expect(rpc).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the body has no Figma URLs", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });

    await recordFigmaReferences({ roomId: ROOM_ID, body: "just plain text" });

    expect(rpc).not.toHaveBeenCalled();
  });

  it("swallows an RPC error and still resolves", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    mocks.createClient.mockResolvedValue({ rpc });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordFigmaReferences({ roomId: ROOM_ID, body: "https://figma.com/design/a" }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("swallows a thrown RPC rejection for one URL without aborting the others", async () => {
    const rpc = vi
      .fn()
      .mockRejectedValueOnce(new Error("network down"))
      .mockResolvedValueOnce({ data: null, error: null });
    mocks.createClient.mockResolvedValue({ rpc });
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordFigmaReferences({
        roomId: ROOM_ID,
        body: "https://figma.com/design/a and https://figma.com/design/b",
      }),
    ).resolves.toBeUndefined();

    expect(rpc).toHaveBeenCalledTimes(2);
    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });

  it("resolves even on total failure (e.g. createClient throws)", async () => {
    mocks.createClient.mockRejectedValue(new Error("no client"));
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => {});

    await expect(
      recordFigmaReferences({ roomId: ROOM_ID, body: "https://figma.com/design/a" }),
    ).resolves.toBeUndefined();

    expect(consoleError).toHaveBeenCalled();
    consoleError.mockRestore();
  });
});

describe("removeDesignReference", () => {
  it("maps a successful delete to status removed", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(removeDesignReference(REFERENCE_ID)).resolves.toEqual({
      status: "removed",
    });
    expect(rpc).toHaveBeenCalledWith("delete_design_reference", {
      target_reference_id: REFERENCE_ID,
    });
  });

  it("maps an RPC error to status error", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "boom" } }));
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(removeDesignReference(REFERENCE_ID)).resolves.toEqual({
      status: "error",
    });
  });

  it("maps an invalid id to status error without calling the RPC", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(removeDesignReference("not-a-uuid")).resolves.toEqual({
      status: "error",
    });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps a thrown RPC rejection to status error", async () => {
    const rpc = vi.fn(async () => {
      throw new Error("network down");
    });
    mocks.createClient.mockResolvedValue({ rpc });

    await expect(removeDesignReference(REFERENCE_ID)).resolves.toEqual({
      status: "error",
    });
  });
});

describe("refreshDesignReference", () => {
  const NORMALIZED_URL = "https://www.figma.com/design/abc/Sample";

  function buildRowClient(row: unknown) {
    const single = vi.fn(async () => ({
      data: row,
      error: row ? null : { message: "not found" },
    }));
    const eq = vi.fn(() => ({ single }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    return { from, single, eq, select };
  }

  it("happy path: loads the row, fetches oEmbed ok, caches the thumbnail, upserts ok, returns a signed view", async () => {
    const row = { id: REFERENCE_ID, room_id: ROOM_ID, normalized_url: NORMALIZED_URL };
    const { from } = buildRowClient(row);
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn(async () => ({
      data: { signedUrl: "https://signed.example/thumb.png" },
      error: null,
    }));
    const storageFrom = vi.fn(() => ({ upload, createSignedUrl }));
    const updatedRow = {
      id: REFERENCE_ID,
      room_id: ROOM_ID,
      normalized_url: NORMALIZED_URL,
      title: "Sample File",
      thumbnail_ref: `${ROOM_ID}/${REFERENCE_ID}`,
      oembed_status: "ok",
      fetched_at: "2026-08-14T10:05:00.000Z",
      created_at: "2026-08-14T10:00:00.000Z",
    };
    const rpc = vi.fn(async () => ({ data: updatedRow, error: null }));
    mocks.createClient.mockResolvedValue({ from, storage: { from: storageFrom }, rpc });
    mocks.fetchFigmaOEmbed.mockResolvedValue({
      ok: true,
      thumbnailUrl: "https://f/t.png",
      title: "Sample File",
      status: 200,
    });
    mocks.downloadCappedImage.mockResolvedValue({
      bytes: new Uint8Array([1, 2, 3]),
      contentType: "image/png",
    });

    const view = await refreshDesignReference(REFERENCE_ID);

    expect(mocks.fetchFigmaOEmbed).toHaveBeenCalledWith(NORMALIZED_URL);
    expect(mocks.downloadCappedImage).toHaveBeenCalledWith("https://f/t.png");
    expect(storageFrom).toHaveBeenCalledWith("design-reference-thumbnails");
    expect(upload).toHaveBeenCalledWith(
      `${ROOM_ID}/${REFERENCE_ID}`,
      expect.any(Uint8Array),
      { contentType: "image/png", upsert: true },
    );
    expect(rpc).toHaveBeenCalledWith("add_design_reference", {
      target_room_id: ROOM_ID,
      url: NORMALIZED_URL,
      ref_title: "Sample File",
      thumb: `${ROOM_ID}/${REFERENCE_ID}`,
      status: "ok",
    });
    expect(view).toEqual({
      id: REFERENCE_ID,
      roomId: ROOM_ID,
      normalizedUrl: NORMALIZED_URL,
      title: "Sample File",
      oembedStatus: "ok",
      fetchedAt: "2026-08-14T10:05:00.000Z",
      createdAt: "2026-08-14T10:00:00.000Z",
      thumbnailUrl: "https://signed.example/thumb.png",
    });
  });

  it("oEmbed failure: upserts status failed with no upload, returns a view with a null thumbnailUrl", async () => {
    const row = { id: REFERENCE_ID, room_id: ROOM_ID, normalized_url: NORMALIZED_URL };
    const { from } = buildRowClient(row);
    const upload = vi.fn();
    const createSignedUrl = vi.fn();
    const storageFrom = vi.fn(() => ({ upload, createSignedUrl }));
    const updatedRow = {
      id: REFERENCE_ID,
      room_id: ROOM_ID,
      normalized_url: NORMALIZED_URL,
      title: null,
      thumbnail_ref: null,
      oembed_status: "failed",
      fetched_at: null,
      created_at: "2026-08-14T10:00:00.000Z",
    };
    const rpc = vi.fn(async () => ({ data: updatedRow, error: null }));
    mocks.createClient.mockResolvedValue({ from, storage: { from: storageFrom }, rpc });
    mocks.fetchFigmaOEmbed.mockResolvedValue({
      ok: false,
      thumbnailUrl: null,
      title: null,
      status: 404,
    });

    const view = await refreshDesignReference(REFERENCE_ID);

    expect(mocks.downloadCappedImage).not.toHaveBeenCalled();
    expect(upload).not.toHaveBeenCalled();
    expect(rpc).toHaveBeenCalledWith("add_design_reference", {
      target_room_id: ROOM_ID,
      url: NORMALIZED_URL,
      ref_title: null,
      thumb: null,
      status: "failed",
    });
    expect(view?.oembedStatus).toBe("failed");
    expect(view?.thumbnailUrl).toBeNull();
  });

  it("returns null for a missing row without fetching oEmbed or upserting", async () => {
    const { from } = buildRowClient(null);
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ from, storage: { from: vi.fn() }, rpc });

    const view = await refreshDesignReference(REFERENCE_ID);

    expect(view).toBeNull();
    expect(mocks.fetchFigmaOEmbed).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });

  it("returns null when the upsert RPC rejects a non-editor", async () => {
    const row = { id: REFERENCE_ID, room_id: ROOM_ID, normalized_url: NORMALIZED_URL };
    const { from } = buildRowClient(row);
    const upload = vi.fn(async () => ({ error: null }));
    const createSignedUrl = vi.fn();
    const storageFrom = vi.fn(() => ({ upload, createSignedUrl }));
    const rpc = vi.fn(async () => ({ data: null, error: { message: "not_authorized" } }));
    mocks.createClient.mockResolvedValue({ from, storage: { from: storageFrom }, rpc });
    mocks.fetchFigmaOEmbed.mockResolvedValue({
      ok: false,
      thumbnailUrl: null,
      title: null,
      status: 404,
    });

    const view = await refreshDesignReference(REFERENCE_ID);

    expect(view).toBeNull();
  });

  it("returns null for an invalid id without touching the client", async () => {
    const view = await refreshDesignReference("not-a-uuid");

    expect(view).toBeNull();
    expect(mocks.createClient).not.toHaveBeenCalled();
  });
});
