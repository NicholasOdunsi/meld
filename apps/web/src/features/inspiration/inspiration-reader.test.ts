import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn(), isRoomFakeEnabled: vi.fn(() => false) }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: mocks.isRoomFakeEnabled }));

import { listEditableRooms, listLibrary, listRoomInspiration } from "./inspiration-reader";

const WORKSPACE = "22222222-2222-4222-8222-222222222222";
const ROOM = "33333333-3333-4333-8333-333333333333";
const USER = "44444444-4444-4444-8444-444444444444";

function row(id: string) {
  return {
    id,
    workspace_id: WORKSPACE,
    status: "ready",
    storage_path: `${WORKSPACE}/${id}.png`,
    mime_type: "image/png",
    width: 1,
    height: 1,
    source_url: null,
    note: null,
    capture_channel: "web",
    created_at: "2026-11-06T10:00:00.000Z",
    room_inspiration: [],
  };
}

// A thenable stand-in for a PostgREST query: every filter returns itself.
function query(result: { data: unknown; error: unknown; count?: number }) {
  const builder: Record<string, unknown> = {};
  for (const method of ["select", "eq", "is", "order", "range", "limit"]) {
    builder[method] = vi.fn(() => builder);
  }
  builder.then = (resolve: (value: unknown) => unknown) => resolve(result);
  return builder as Record<string, ReturnType<typeof vi.fn>> & PromiseLike<unknown>;
}

function client(tables: Record<string, ReturnType<typeof query>>) {
  return {
    from: vi.fn((table: string) => tables[table]),
    auth: { getUser: vi.fn(async () => ({ data: { user: { id: USER } } })) },
    storage: {
      from: () => ({
        createSignedUrls: vi.fn(async (paths: string[]) => ({
          data: paths.map((path) => ({ path, signedUrl: `https://signed/${path}`, error: null })),
          error: null,
        })),
      }),
    },
  };
}

beforeEach(() => vi.clearAllMocks());

describe("listLibrary", () => {
  it("asks for one row more than a page to know whether more exist", async () => {
    const ids = Array.from({ length: 61 }, (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`);
    const items = query({ data: ids.map(row), error: null });
    mocks.createClient.mockResolvedValue(client({ inspiration_items: items }));

    const page = await listLibrary({ workspaceId: WORKSPACE, offset: 0 });

    expect(items.eq).toHaveBeenCalledWith("workspace_id", WORKSPACE);
    expect(items.eq).toHaveBeenCalledWith("status", "ready");
    expect(items.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(items.range).toHaveBeenCalledWith(0, 60);
    expect(page.items).toHaveLength(60);
    expect(page.hasMore).toBe(true);
    expect(page.items[0]?.imageUrl).toBe(`https://signed/${WORKSPACE}/${ids[0]}.png`);
  });

  it("returns an empty page for bad input or a query error", async () => {
    expect(await listLibrary({ workspaceId: "nope", offset: 0 })).toEqual({ items: [], hasMore: false });
    mocks.createClient.mockResolvedValue(client({ inspiration_items: query({ data: null, error: { message: "x" } }) }));
    vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await listLibrary({ workspaceId: WORKSPACE, offset: 0 })).toEqual({ items: [], hasMore: false });
  });
});

describe("listRoomInspiration", () => {
  it("reads linked items newest-link first", async () => {
    const links = query({
      data: [{ created_at: "2026-11-06T11:00:00.000Z", inspiration_items: row("11111111-1111-4111-8111-111111111111") }],
      error: null,
    });
    mocks.createClient.mockResolvedValue(client({ room_inspiration: links }));
    const items = await listRoomInspiration(ROOM);
    expect(links.eq).toHaveBeenCalledWith("room_id", ROOM);
    expect(links.order).toHaveBeenCalledWith("created_at", { ascending: false });
    expect(items.map((item) => item.id)).toEqual(["11111111-1111-4111-8111-111111111111"]);
  });
});

describe("listEditableRooms", () => {
  it("lists the current user's editable rooms in this workspace as Project › Room", async () => {
    const participants = query({
      data: [{ room_id: ROOM, rooms: { name: "Login", workspace_id: WORKSPACE, projects: { name: "App" } } }],
      error: null,
    });
    mocks.createClient.mockResolvedValue(client({ room_participants: participants }));
    expect(await listEditableRooms(WORKSPACE)).toEqual([{ roomId: ROOM, roomName: "Login", projectName: "App" }]);
    expect(participants.eq).toHaveBeenCalledWith("user_id", USER);
    expect(participants.eq).toHaveBeenCalledWith("access", "edit");
    expect(participants.eq).toHaveBeenCalledWith("rooms.workspace_id", WORKSPACE);
  });
});
