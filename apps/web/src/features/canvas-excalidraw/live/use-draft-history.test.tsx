// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { createScreenStore } from "../screen-store";

const actions = vi.hoisted(() => ({ read: vi.fn(), save: vi.fn(), convert: vi.fn(), mapping: vi.fn() }));
vi.mock("@/features/design/canvas-screen-source", () => ({
  readScreenSource: actions.read,
  saveScreenVersion: actions.save,
  convertBoardScreen: actions.convert,
  readBoardConversion: actions.mapping,
}));
vi.mock("../design-screen-board", () => ({
  boardScreenId: (id: string) => `ds-${id}`,
  formFactorForFrame: () => "mobile",
  relinkConvertedFrames: (_d: unknown, _f: string, _t: string, publish: () => void) => publish(),
}));
import { createHandEditing } from "./hand-editing";
import { useDraftHistory } from "./use-draft-history";

const id = "ds-e5000000-0000-4000-8000-000000000002";
const source = { kind: "html" as const, entry: "index.html", files: { "index.html": "<button>Start</button>" } };
const edited = { "index.html": "<button>Start!</button>" };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// The real hand-editing and live controller; no panel is mounted anywhere.
async function setup(access: "edit" | "view" = "edit", wake = true) {
  actions.read.mockResolvedValue({ status: "ok", screen: { legacy: false, screenId: id.slice(3), versionId: "v1", formFactor: "mobile", source, links: [] } });
  actions.save.mockResolvedValue({ status: "saved", versionId: "v2" });
  const compiler = {
    compile: vi.fn(async () => ({ ok: true as const, screen: { kind: "html" as const, html: "<button>Start</button>", scripts: [], styles: [], links: [] } })),
    inspect: vi.fn(), tweak: vi.fn(), links: vi.fn(async () => []), dispose: vi.fn(),
  };
  const editing = createHandEditing({ roomId: "room", access, store: createScreenStore(), compiler, api: () => null, runtimeBundle: async () => "", loadLegacy: async () => null });
  const view = renderHook(() => useDraftHistory(editing));
  if (wake) await act(async () => { await editing.live.wake(id); });
  const cleanupAll = () => { cleanup(); editing.live.dispose(); editing.drafts.get(id)?.dispose(); };
  return { editing, view, cleanupAll };
}

describe("useDraftHistory", () => {
  it("is null while no screen is awake", async () => {
    const s = await setup("edit", false);
    expect(s.view.result.current).toBeNull();
    s.cleanupAll();
  });

  it("is null for a read-only screen", async () => {
    const s = await setup("view");
    expect(s.view.result.current).toBeNull();
    s.cleanupAll();
  });

  it("reflects the live draft's canUndo/canRedo with no panel mounted, and runs undo and redo", async () => {
    const s = await setup();
    expect(s.view.result.current).toMatchObject({ canUndo: false, canRedo: false });
    const draft = s.editing.drafts.get(id)!;
    const preview = vi.spyOn(s.editing.live, "previewDraft");
    act(() => draft.replace(edited));
    expect(s.view.result.current).toMatchObject({ canUndo: true, canRedo: false });
    act(() => s.view.result.current!.undo());
    expect(draft.getState().source.files).toEqual(source.files);
    expect(preview).toHaveBeenLastCalledWith(id, expect.objectContaining({ files: source.files }), 2, "history");
    await waitFor(() => expect(s.view.result.current).toMatchObject({ canUndo: false, canRedo: true }));
    act(() => s.view.result.current!.redo());
    expect(draft.getState().source.files).toEqual(edited);
    expect(preview).toHaveBeenLastCalledWith(id, expect.objectContaining({ files: edited }), 3, "history");
    expect(s.view.result.current).toMatchObject({ canUndo: true, canRedo: false });
    s.cleanupAll();
  });

  it("goes back to null when the screen sleeps", async () => {
    const s = await setup();
    expect(s.view.result.current).not.toBeNull();
    await act(async () => { await s.editing.live.sleep(); });
    expect(s.view.result.current).toBeNull();
    s.cleanupAll();
  });
});
