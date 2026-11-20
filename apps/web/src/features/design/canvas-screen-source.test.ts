import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ createClient: vi.fn() }));
vi.mock("@/lib/supabase/server", () => ({ createClient: mocks.createClient }));
vi.mock("@/features/rooms/e2e-gate", () => ({ isRoomFakeEnabled: () => false }));

import {
  createCanvasScreen,
  listScreenVersions,
  readScreenSource,
  restoreScreenVersion,
  saveScreenVersion,
} from "./canvas-screen-source";

const ROOM = "e4000000-0000-4000-8000-000000000001";
const SCREEN = "e5000000-0000-4000-8000-000000000001";
const VERSION = "e6000000-0000-4000-8000-000000000001";
const NEXT = "e6000000-0000-4000-8000-000000000002";
const source = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };

beforeEach(() => vi.clearAllMocks());

describe("createCanvasScreen", () => {
  it("calls create_canvas_screen and maps the ids", async () => {
    const rpc = vi.fn(async () => ({ data: { screenId: SCREEN, versionId: VERSION }, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(createCanvasScreen({ roomId: ROOM, name: "Today", source, formFactor: "mobile" }))
      .resolves.toEqual({ status: "created", screenId: SCREEN, versionId: VERSION });
    expect(rpc).toHaveBeenCalledWith("create_canvas_screen", {
      target_room_id: ROOM, screen_name: "Today", new_kind: "react",
      new_files: source.files, new_entry: "App.tsx", new_form_factor: "mobile",
    });
  });

  it("rejects a source whose entry is not a file, without calling the RPC", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(createCanvasScreen({ roomId: ROOM, name: "x", source: { ...source, entry: "Main.tsx" }, formFactor: "mobile" }))
      .resolves.toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });
});

describe("saveScreenVersion", () => {
  it("passes the base version and maps saved", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "saved", versionId: NEXT }, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION, files: source.files, links: ["settings"] }))
      .resolves.toEqual({ status: "saved", versionId: NEXT });
    expect(rpc).toHaveBeenCalledWith("save_canvas_screen_version", {
      target_screen_id: SCREEN, base_version: VERSION, new_files: source.files,
      new_links: ["settings"], new_kind: null, new_entry: null,
    });
  });

  it("maps a conflict", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "conflict", versionId: NEXT }, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION, files: source.files }))
      .resolves.toEqual({ status: "conflict", versionId: NEXT });
  });

  it("preserves a busy conflict whose head still equals the supplied base", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "conflict", versionId: VERSION }, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION, files: source.files }))
      .resolves.toEqual({ status: "conflict", versionId: VERSION });
    expect(rpc).toHaveBeenCalledOnce();
  });

  it.each([null, "UPPER", "", "a".repeat(65), "target\n"])(
    "rejects an invalid link item %j before calling the RPC", async (link) => {
      const rpc = vi.fn();
      mocks.createClient.mockResolvedValue({ rpc });
      await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION,
        files: source.files, links: [link] as string[] })).resolves.toEqual({ status: "error" });
      expect(rpc).not.toHaveBeenCalled();
    },
  );

  it("rejects too many links and nested arrays before calling the RPC", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });
    for (const links of [Array.from({ length: 101 }, () => "target"), [["target"]]]) {
      await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION,
        files: source.files, links: links as string[] })).resolves.toEqual({ status: "error" });
    }
    expect(rpc).not.toHaveBeenCalled();
  });

  it("maps an RPC error", async () => {
    const rpc = vi.fn(async () => ({ data: null, error: { message: "nope" } }));
    mocks.createClient.mockResolvedValue({ rpc });
    vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: null, files: source.files }))
      .resolves.toEqual({ status: "error" });
  });

  it("rejects an entry that is not one of the files, without calling the RPC", async () => {
    const rpc = vi.fn();
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION, files: source.files, entry: "Main.tsx" }))
      .resolves.toEqual({ status: "error" });
    await expect(saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION, files: { "../x.tsx": "x" }, entry: "../x.tsx" }))
      .resolves.toEqual({ status: "error" });
    expect(rpc).not.toHaveBeenCalled();
  });

  it("passes a valid entry through", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "saved", versionId: NEXT }, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });
    await saveScreenVersion({ screenId: SCREEN, baseVersionId: VERSION, files: { "index.html": "<p>x</p>" }, kind: "html", entry: "index.html" });
    expect(rpc).toHaveBeenCalledWith("save_canvas_screen_version", expect.objectContaining({ new_kind: "html", new_entry: "index.html" }));
  });
});

describe("restoreScreenVersion", () => {
  it("calls restore_screen_version", async () => {
    const rpc = vi.fn(async () => ({ data: { status: "saved", versionId: NEXT }, error: null }));
    mocks.createClient.mockResolvedValue({ rpc });
    await expect(restoreScreenVersion({ screenId: SCREEN, versionId: VERSION }))
      .resolves.toEqual({ status: "saved", versionId: NEXT });
    expect(rpc).toHaveBeenCalledWith("restore_screen_version", { target_screen_id: SCREEN, target_version_id: VERSION });
  });
});

function selectChain(result: { data: unknown; error: unknown }) {
  const chain: Record<string, unknown> = {};
  for (const name of ["select", "eq", "is", "order", "limit"]) chain[name] = vi.fn(() => chain);
  chain.maybeSingle = vi.fn(async () => result);
  chain.then = (resolve: (value: unknown) => void) => resolve(result);
  return chain;
}

describe("readScreenSource", () => {
  it("returns the current react source", async () => {
    const screens = selectChain({ data: { id: SCREEN, current_version_id: VERSION, form_factor: "mobile" }, error: null });
    const versions = selectChain({ data: { id: VERSION, source_kind: "react", files: source.files, entry: "App.tsx", links: [] }, error: null });
    mocks.createClient.mockResolvedValue({ from: vi.fn((table: string) => (table === "design_screens" ? screens : versions)) });
    await expect(readScreenSource(SCREEN)).resolves.toEqual({
      status: "ok",
      screen: { screenId: SCREEN, versionId: VERSION, formFactor: "mobile", legacy: false, source, links: [] },
    });
  });

  it("marks a legacy version", async () => {
    const screens = selectChain({ data: { id: SCREEN, current_version_id: VERSION, form_factor: "desktop" }, error: null });
    const versions = selectChain({ data: { id: VERSION, source_kind: "legacy", files: null, entry: null, links: [] }, error: null });
    mocks.createClient.mockResolvedValue({ from: vi.fn((table: string) => (table === "design_screens" ? screens : versions)) });
    await expect(readScreenSource(SCREEN)).resolves.toEqual({
      status: "ok",
      screen: { screenId: SCREEN, versionId: VERSION, formFactor: "desktop", legacy: true },
    });
  });
});

describe("listScreenVersions", () => {
  it("lists newest first", async () => {
    const versions = selectChain({ data: [{ id: NEXT, created_at: "2026-11-20T10:00:00Z", source_kind: "react" }], error: null });
    mocks.createClient.mockResolvedValue({ from: vi.fn(() => versions) });
    await expect(listScreenVersions(SCREEN)).resolves.toEqual({
      status: "ok", versions: [{ id: NEXT, createdAt: "2026-11-20T10:00:00Z", kind: "react" }],
    });
    expect(versions.order).toHaveBeenCalledWith("created_at", { ascending: false });
  });
});
