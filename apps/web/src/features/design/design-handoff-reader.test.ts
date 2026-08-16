import { describe, expect, it, vi, beforeEach } from "vitest";

const maybeSingle = vi.fn();
const limit = vi.fn(() => ({ maybeSingle }));
const order = vi.fn(() => ({ limit }));
const eq = vi.fn(() => ({ order }));
const select = vi.fn(() => ({ eq }));
const from = vi.fn(() => ({ select }));
vi.mock("@/lib/supabase/server", () => ({
  createClient: vi.fn(async () => ({ from })),
}));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import { getRoomDesignHandoff } from "./design-handoff-reader";

const ROOM = "11111111-1111-4111-8111-111111111111";

beforeEach(() => {
  maybeSingle.mockReset();
  limit.mockClear();
  order.mockClear();
  eq.mockClear();
  select.mockClear();
  from.mockClear();
});

describe("getRoomDesignHandoff", () => {
  it("maps the latest snapshot row snake→camel and parses its manifest", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "22222222-2222-4222-8222-222222222222",
        manifest_json: {
          screens: [
            {
              screenId: "33333333-3333-4333-8333-333333333333",
              name: "Home",
              currentVersionId: "44444444-4444-4444-8444-444444444444",
            },
          ],
        },
        start_screen_id: "33333333-3333-4333-8333-333333333333",
        profile_version_id: "55555555-5555-4555-8555-555555555555",
        prd_revision: 3,
        created_at: "2026-08-14T10:00:00.000Z",
      },
      error: null,
    });

    const out = await getRoomDesignHandoff(ROOM);

    expect(from).toHaveBeenCalledWith("design_handoff_snapshots");
    expect(eq).toHaveBeenCalledWith("room_id", ROOM);
    expect(order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(limit).toHaveBeenCalledWith(1);
    expect(out).toEqual({
      id: "22222222-2222-4222-8222-222222222222",
      manifest: {
        screens: [
          {
            screenId: "33333333-3333-4333-8333-333333333333",
            name: "Home",
            currentVersionId: "44444444-4444-4444-8444-444444444444",
          },
        ],
      },
      startScreenId: "33333333-3333-4333-8333-333333333333",
      profileVersionId: "55555555-5555-4555-8555-555555555555",
      prdRevision: 3,
      createdAt: "2026-08-14T10:00:00.000Z",
    });
  });

  it("returns null when there is no snapshot row", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: null });
    expect(await getRoomDesignHandoff(ROOM)).toBeNull();
  });

  it("returns null on a query error", async () => {
    maybeSingle.mockResolvedValue({ data: null, error: { message: "x" } });
    expect(await getRoomDesignHandoff(ROOM)).toBeNull();
  });

  it("returns null when the row's manifest fails to parse", async () => {
    maybeSingle.mockResolvedValue({
      data: {
        id: "22222222-2222-4222-8222-222222222222",
        manifest_json: { screens: [{ screenId: "not-a-uuid", name: "Home" }] },
        start_screen_id: null,
        profile_version_id: null,
        prd_revision: null,
        created_at: "2026-08-14T10:00:00.000Z",
      },
      error: null,
    });
    expect(await getRoomDesignHandoff(ROOM)).toBeNull();
  });

  it("returns null on a bad room id", async () => {
    expect(await getRoomDesignHandoff("nope")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });
});
