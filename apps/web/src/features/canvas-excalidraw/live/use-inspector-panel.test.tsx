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
import { useInspectorPanel } from "./use-inspector-panel";

const id = "ds-e5000000-0000-4000-8000-000000000001";
const source = { kind: "html" as const, entry: "index.html", files: { "index.html": "<button>Start</button>" } };

afterEach(() => { cleanup(); vi.clearAllMocks(); });

// The real hand-editing and live controller around a fake frame; only the
// compiler and persistence are stubbed.
async function setup(access: "edit" | "view" = "edit") {
  actions.read.mockResolvedValue({ status: "ok", screen: { legacy: false, screenId: id.slice(3), versionId: "v1", formFactor: "mobile", source, links: [] } });
  actions.save.mockResolvedValue({ status: "saved", versionId: "v2" });
  const compiler = {
    compile: vi.fn(async () => ({ ok: true as const, screen: { kind: "html" as const, html: "<button>Start</button>", scripts: [], styles: [], links: [] } })),
    inspect: vi.fn(), tweak: vi.fn(), links: vi.fn(async () => []), dispose: vi.fn(),
  };
  const editing = createHandEditing({ roomId: "room", access, store: createScreenStore(), compiler, api: () => null, runtimeBundle: async () => "", loadLegacy: async () => null });
  const view = renderHook(() => useInspectorPanel(editing));
  const frame = { postMessage: vi.fn() };
  const send = (data: object) => act(() => { editing.live.handleMessage({ source: frame, data: { source: "orion-frame", ...data } }); });
  await act(async () => { await editing.live.wake(id); });
  editing.live.attachFrame(frame as unknown as Window);
  send({ type: "ready" });
  const draft = editing.drafts.get(id)!;
  const lastEpoch = () => [...frame.postMessage.mock.calls].reverse().map(([m]) => m).find((m) => typeof m.epoch === "number")!.epoch as number;
  const pick = () => send({ type: "picked", epoch: lastEpoch(), src: `index.html:0:${source.files["index.html"].length}`, label: "Start" });
  const escape = (target: EventTarget = window) => act(() => { target.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true })); });
  const cleanupAll = () => { cleanup(); editing.live.dispose(); draft.dispose(); };
  return { editing, view, frame, send, pick, escape, draft, cleanupAll };
}

describe("useInspectorPanel", () => {
  it("shows no panel after a wake, then shows it for a pick on the Tweak tab", async () => {
    const s = await setup();
    expect(s.view.result.current.visible).toBe(false);
    expect(s.editing.live.isPicking()).toBe(true);
    s.pick();
    expect(s.view.result.current).toMatchObject({ visible: true, panelTab: "tweak", panelOpen: false });
    s.cleanupAll();
  });

  it("clears a pick on Escape without sleeping, and sleeps on the next one", async () => {
    const s = await setup();
    s.pick();
    s.escape();
    expect(s.editing.getPicked()).toBeNull();
    expect(s.view.result.current.visible).toBe(false);
    expect(s.frame.postMessage).toHaveBeenCalledWith(expect.objectContaining({ type: "clear-selection" }), "*");
    expect(s.editing.live.getState().phase).toBe("running");
    s.escape();
    await waitFor(() => expect(s.editing.live.getState().phase).toBe("asleep"));
    s.cleanupAll();
  });

  it("ignores an Escape that happens inside a popover", async () => {
    const s = await setup();
    s.pick();
    const popover = document.createElement("div");
    popover.setAttribute("popover", "");
    const button = document.createElement("button");
    popover.appendChild(button);
    document.body.appendChild(popover);
    s.escape(button);
    expect(s.editing.getPicked()).not.toBeNull();
    expect(s.editing.live.getState().phase).toBe("running");
    popover.remove();
    s.cleanupAll();
  });

  it("turns select mode off and drops the pick in Interact, and resets Interact when the screen changes", async () => {
    const s = await setup();
    s.pick();
    act(() => s.view.result.current.toggleInteract());
    expect(s.view.result.current.interact).toBe(true);
    expect(s.editing.getPicked()).toBeNull();
    expect(s.editing.live.isPicking()).toBe(false);
    expect(s.view.result.current.visible).toBe(false);
    act(() => s.view.result.current.toggleInteract());
    expect(s.editing.live.isPicking()).toBe(true);
    act(() => s.view.result.current.toggleInteract());
    await act(async () => { await s.editing.live.sleep(); });
    expect(s.view.result.current.interact).toBe(false);
    s.cleanupAll();
  });

  it("Close clears the pick, a pending reselect and the open Code tab", async () => {
    const s = await setup();
    act(() => s.view.result.current.showCode());
    s.pick();
    act(() => s.view.result.current.onTabChange("code"));
    act(() => s.editing.setReselect("index.html:0:30"));
    expect(s.view.result.current.panelOpen).toBe(true);
    act(() => s.view.result.current.close());
    expect(s.view.result.current).toMatchObject({ panelOpen: false, visible: false });
    expect(s.editing.getPicked()).toBeNull();
    expect(s.editing.hasReselect()).toBe(false);
    s.cleanupAll();
  });

  it("keeps the panel up while typing in Code after a pick", async () => {
    const s = await setup();
    s.pick();
    act(() => s.view.result.current.onTabChange("code"));
    // What a code edit does: the draft revision moves and the reselect is dropped.
    act(() => { s.editing.setReselect(null); s.draft.replace({ "index.html": "<button>Start!</button>" }); });
    expect(s.editing.getValidPick()).toBeNull();
    expect(s.view.result.current).toMatchObject({ visible: true, panelOpen: true, panelTab: "code" });
    s.cleanupAll();
  });

  it("closes the panel on Escape after Code, a pick and Escape, then sleeps on the next", async () => {
    const s = await setup();
    act(() => s.view.result.current.showCode());
    expect(s.view.result.current.visible).toBe(true);
    s.pick();
    expect(s.view.result.current).toMatchObject({ panelOpen: false, panelTab: "tweak", visible: true });
    s.escape();
    expect(s.view.result.current.visible).toBe(false);
    expect(s.editing.live.getState().phase).toBe("running");
    s.escape();
    await waitFor(() => expect(s.editing.live.getState().phase).toBe("asleep"));
    s.cleanupAll();
  });

  it("opens Code for a compile failure", async () => {
    const s = await setup();
    s.cleanupAll();
    actions.read.mockResolvedValue({ status: "ok", screen: { legacy: false, screenId: id.slice(3), versionId: "v1", formFactor: "mobile", source, links: [] } });
    const editing = createHandEditing({
      roomId: "room", access: "edit", store: createScreenStore(),
      compiler: { compile: vi.fn(async () => ({ ok: false as const, errors: [{ file: "index.html", message: "bad" }] })), inspect: vi.fn(), tweak: vi.fn(), links: vi.fn(async () => []), dispose: vi.fn() },
      api: () => null, runtimeBundle: async () => "", loadLegacy: async () => null,
    });
    const view = renderHook(() => useInspectorPanel(editing));
    await act(async () => { await editing.live.wake(id); });
    expect(view.result.current).toMatchObject({ visible: true, panelOpen: true, panelTab: "code" });
    editing.live.dispose();editing.drafts.get(id)?.dispose();
  });

  it("opens Code after waking a read-only screen, with Tweak disabled", async () => {
    const s = await setup("view");
    expect(s.editing.live.isPicking()).toBe(false);
    act(() => s.view.result.current.afterWake("tweak"));
    expect(s.view.result.current).toMatchObject({ visible: true, panelOpen: true, panelTab: "code" });
    expect(s.view.result.current.tweakDisabled).toMatch(/can't be edited/);
    act(() => s.view.result.current.onTabChange("tweak"));
    expect(s.view.result.current).toMatchObject({ visible: true, panelTab: "code" });
    s.cleanupAll();
  });

  it("opens nothing after waking an editable screen on Tweak, and Code when asked", async () => {
    const s = await setup();
    act(() => s.view.result.current.afterWake("tweak"));
    expect(s.view.result.current.visible).toBe(false);
    act(() => s.view.result.current.afterWake("code"));
    expect(s.view.result.current).toMatchObject({ visible: true, panelTab: "code" });
    s.cleanupAll();
  });

  it("disables the Tweak tab with nothing selected instead of closing the panel", async () => {
    const s = await setup();
    act(() => s.view.result.current.showCode());
    expect(s.view.result.current.tweakDisabled).toBe("Click something in the screen to tweak it");
    act(() => s.view.result.current.onTabChange("tweak"));
    expect(s.view.result.current).toMatchObject({ visible: true, panelOpen: true, panelTab: "code" });
    s.pick();
    expect(s.view.result.current.tweakDisabled).toBeUndefined();
    act(() => s.view.result.current.onTabChange("code"));
    act(() => s.view.result.current.onTabChange("tweak"));
    expect(s.view.result.current).toMatchObject({ visible: true, panelTab: "tweak" });
    s.cleanupAll();
  });

  it("treats an element about to be selected again as selected: Escape clears it and does not sleep", async () => {
    const s = await setup();
    s.pick();
    // What a tweak does: the source moves on and the element waits to be selected again.
    act(() => { s.editing.setReselect("index.html:0:30"); s.draft.replace({ "index.html": "<button>Start!</button>" }); });
    expect(s.editing.getValidPick()).toBeNull();
    expect(s.view.result.current.visible).toBe(true);
    s.escape();
    expect(s.editing.hasReselect()).toBe(false);
    expect(s.view.result.current.visible).toBe(false);
    expect(s.editing.live.getState().phase).not.toBe("asleep");
    s.cleanupAll();
  });

  it("the frame's Escape during a pending reselect clears it instead of sleeping", async () => {
    const s = await setup();
    s.pick();
    act(() => { s.editing.setReselect("index.html:0:30"); s.draft.replace({ "index.html": "<button>Start!</button>" }); });
    s.send({ type: "escape" });
    expect(s.editing.hasReselect()).toBe(false);
    expect(s.editing.live.getState().phase).not.toBe("asleep");
    s.cleanupAll();
  });

  it("Escape leaves Interact first (screen stays awake, selecting comes back), then sleeps", async () => {
    const s = await setup();
    act(() => s.view.result.current.toggleInteract());
    expect(s.editing.live.isPicking()).toBe(false);
    s.escape();
    expect(s.view.result.current.interact).toBe(false);
    expect(s.editing.live.isPicking()).toBe(true);
    expect(s.editing.live.getState().phase).toBe("running");
    s.escape();
    await waitFor(() => expect(s.editing.live.getState().phase).toBe("asleep"));
    s.cleanupAll();
  });

  it("the frame's Escape (the screen has the keyboard while interacting) also leaves Interact first", async () => {
    const s = await setup();
    act(() => s.view.result.current.toggleInteract());
    s.send({ type: "escape" });
    expect(s.view.result.current.interact).toBe(false);
    expect(s.editing.live.getState().phase).toBe("running");
    s.send({ type: "escape" });
    await waitFor(() => expect(s.editing.live.getState().phase).toBe("asleep"));
    s.cleanupAll();
  });

  it("two quick frame Escapes in Interact leave Interact, then sleep (no double exit before a re-render)", async () => {
    const s = await setup();
    act(() => s.view.result.current.toggleInteract());
    act(() => {
      s.editing.live.handleMessage({ source: s.frame, data: { source: "orion-frame", type: "escape" } });
      s.editing.live.handleMessage({ source: s.frame, data: { source: "orion-frame", type: "escape" } });
    });
    expect(s.view.result.current.interact).toBe(false);
    await waitFor(() => expect(s.editing.live.getState().phase).toBe("asleep"));
    s.cleanupAll();
  });
});
