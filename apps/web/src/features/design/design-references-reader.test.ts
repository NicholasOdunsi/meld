import { describe, expect, it, vi, beforeEach } from "vitest";

const order = vi.fn();
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
const createSignedUrls = vi.fn();
const storageFrom = vi.fn(() => ({ createSignedUrls }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({
    from,
    storage: { from: storageFrom },
  })),
}));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import { listRoomDesignReferences, toReferenceView } from "./design-references-reader";

const ROOM = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  order.mockReset();
  eq.mockClear();
  select.mockClear();
  from.mockClear();
  createSignedUrls.mockReset();
  storageFrom.mockClear();
});

describe("listRoomDesignReferences", () => {
  it("maps rows snake→camel and signs an ok row's thumbnail", async () => {
    order.mockResolvedValue({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          room_id: ROOM,
          normalized_url: "https://www.figma.com/file/abc123/Sample",
          title: "Sample File",
          thumbnail_ref: "refs/22222222-2222-4222-8222-222222222222.png",
          oembed_status: "ok",
          fetched_at: "2026-08-14T10:05:00.000Z",
          created_at: "2026-08-14T10:00:00.000Z",
        },
      ],
      error: null,
    });
    createSignedUrls.mockResolvedValue({
      data: [
        {
          path: "refs/22222222-2222-4222-8222-222222222222.png",
          signedUrl: "https://signed.example/thumb.png",
        },
      ],
      error: null,
    });

    const out = await listRoomDesignReferences(ROOM);

    expect(from).toHaveBeenCalledWith("design_references");
    expect(storageFrom).toHaveBeenCalledWith("design-reference-thumbnails");
    expect(createSignedUrls).toHaveBeenCalledWith(
      ["refs/22222222-2222-4222-8222-222222222222.png"],
      3600,
    );
    expect(out).toEqual([
      {
        id: "22222222-2222-4222-8222-222222222222",
        roomId: ROOM,
        normalizedUrl: "https://www.figma.com/file/abc123/Sample",
        title: "Sample File",
        oembedStatus: "ok",
        fetchedAt: "2026-08-14T10:05:00.000Z",
        createdAt: "2026-08-14T10:00:00.000Z",
        thumbnailUrl: "https://signed.example/thumb.png",
      },
    ]);
    expect(out[0]).not.toHaveProperty("thumbnail_ref");
    expect(out[0]).not.toHaveProperty("thumbnailRef");
  });

  it("signs every ok row's thumbnail in a single batched call, not one per row", async () => {
    order.mockResolvedValue({
      data: [
        {
          id: "22222222-2222-4222-8222-222222222222",
          room_id: ROOM,
          normalized_url: "https://www.figma.com/file/abc123/Sample",
          title: "Sample File",
          thumbnail_ref: "refs/one.png",
          oembed_status: "ok",
          fetched_at: "2026-08-14T10:05:00.000Z",
          created_at: "2026-08-14T10:00:00.000Z",
        },
        {
          id: "55555555-5555-4555-8555-555555555555",
          room_id: ROOM,
          normalized_url: "https://www.figma.com/file/xyz999/Second",
          title: "Second File",
          thumbnail_ref: "refs/two.png",
          oembed_status: "ok",
          fetched_at: "2026-08-14T10:06:00.000Z",
          created_at: "2026-08-14T10:03:00.000Z",
        },
      ],
      error: null,
    });
    createSignedUrls.mockResolvedValue({
      data: [
        { path: "refs/one.png", signedUrl: "https://signed.example/one.png" },
        { path: "refs/two.png", signedUrl: "https://signed.example/two.png" },
      ],
      error: null,
    });

    const out = await listRoomDesignReferences(ROOM);

    // One round trip covering both rows -- never N per-row signing calls.
    expect(createSignedUrls).toHaveBeenCalledTimes(1);
    expect(createSignedUrls).toHaveBeenCalledWith(
      ["refs/one.png", "refs/two.png"],
      3600,
    );
    expect(out.map((view) => view.thumbnailUrl)).toEqual([
      "https://signed.example/one.png",
      "https://signed.example/two.png",
    ]);
  });

  it("gives a pending row a null thumbnailUrl without signing", async () => {
    order.mockResolvedValue({
      data: [
        {
          id: "33333333-3333-4333-8333-333333333333",
          room_id: ROOM,
          normalized_url: "https://www.figma.com/file/def456/Other",
          title: null,
          thumbnail_ref: null,
          oembed_status: "pending",
          fetched_at: null,
          created_at: "2026-08-14T10:01:00.000Z",
        },
      ],
      error: null,
    });

    const out = await listRoomDesignReferences(ROOM);

    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(out).toEqual([
      {
        id: "33333333-3333-4333-8333-333333333333",
        roomId: ROOM,
        normalizedUrl: "https://www.figma.com/file/def456/Other",
        title: null,
        oembedStatus: "pending",
        fetchedAt: null,
        createdAt: "2026-08-14T10:01:00.000Z",
        thumbnailUrl: null,
      },
    ]);
  });

  it("gives a failed row a null thumbnailUrl", async () => {
    order.mockResolvedValue({
      data: [
        {
          id: "44444444-4444-4444-8444-444444444444",
          room_id: ROOM,
          normalized_url: "https://www.figma.com/file/ghi789/Third",
          title: null,
          thumbnail_ref: null,
          oembed_status: "failed",
          fetched_at: null,
          created_at: "2026-08-14T10:02:00.000Z",
        },
      ],
      error: null,
    });

    const out = await listRoomDesignReferences(ROOM);

    expect(createSignedUrls).not.toHaveBeenCalled();
    expect(out[0].thumbnailUrl).toBeNull();
  });

  it("returns [] on a bad room id", async () => {
    expect(await listRoomDesignReferences("nope")).toEqual([]);
    expect(from).not.toHaveBeenCalled();
  });

  it("returns [] on error", async () => {
    order.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await listRoomDesignReferences(ROOM)).toEqual([]);
  });
});

describe("toReferenceView", () => {
  it("is a pure mapper: assembles the view from a row + a caller-provided thumbnailUrl, no storage call", () => {
    const view = toReferenceView(
      {
        id: "22222222-2222-4222-8222-222222222222",
        room_id: ROOM,
        normalized_url: "https://www.figma.com/file/abc123/Sample",
        title: "Sample File",
        thumbnail_ref: "refs/single.png",
        oembed_status: "ok",
        fetched_at: "2026-08-14T10:05:00.000Z",
        created_at: "2026-08-14T10:00:00.000Z",
      },
      { thumbnailUrl: "https://signed.example/single.png" },
    );

    expect(storageFrom).not.toHaveBeenCalled();
    expect(view).toEqual({
      id: "22222222-2222-4222-8222-222222222222",
      roomId: ROOM,
      normalizedUrl: "https://www.figma.com/file/abc123/Sample",
      title: "Sample File",
      oembedStatus: "ok",
      fetchedAt: "2026-08-14T10:05:00.000Z",
      createdAt: "2026-08-14T10:00:00.000Z",
      thumbnailUrl: "https://signed.example/single.png",
    });
  });

  it("passes a null thumbnailUrl straight through for a failed row", () => {
    const view = toReferenceView(
      {
        id: "44444444-4444-4444-8444-444444444444",
        room_id: ROOM,
        normalized_url: "https://www.figma.com/file/ghi789/Third",
        title: null,
        thumbnail_ref: null,
        oembed_status: "failed",
        fetched_at: null,
        created_at: "2026-08-14T10:02:00.000Z",
      },
      { thumbnailUrl: null },
    );

    expect(view?.thumbnailUrl).toBeNull();
    expect(view?.oembedStatus).toBe("failed");
  });

  it("returns null for a malformed row", () => {
    const view = toReferenceView({ id: "not-a-uuid" }, { thumbnailUrl: null });
    expect(view).toBeNull();
  });
});
