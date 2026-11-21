// @vitest-environment jsdom
import { act, cleanup, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { CompileResult } from "@meld/screen-runtime";
import type { Draft } from "./edit-draft";
import { createLiveController } from "./live-controller";
import { useSelectMode } from "./use-select-mode";

const source = { kind: "react" as const, files: { "App.tsx": "export default () => <main/>" }, entry: "App.tsx" };
const compiled: CompileResult = { ok: true, screen: { kind: "react", styles: [], scripts: [], html: "<div></div>", links: [] } };

beforeEach(() => vi.useFakeTimers());
afterEach(() => { cleanup(); vi.useRealTimers(); });

function setup(canEdit = true, drafted = true) {
  const live = createLiveController({
    loadSource: async () => ({ source, snapshot: false, revision: 0 }),
    compile: async () => compiled,
    runtimeBundle: async () => "",
    onSnapshot: vi.fn(),
  });
  const frame = { postMessage: vi.fn() };
  const modes = () => frame.postMessage.mock.calls.map(([message]) => message).filter((message) => message.type === "pick-mode").map((message) => message.enabled);
  const draft = {} as Draft;
  const reselect = { value: null as string | null };
  const editing = {
    drafts: { get: () => (drafted ? draft : undefined) },
    canEdit: () => canEdit,
    takeReselect: () => { const value = reselect.value; reselect.value = null; return value; },
  };
  const ready = async () => {
    live.attachFrame(frame as unknown as Window);
    await act(async () => { live.handleMessage({ source: frame, data: { source: "orion-frame", type: "ready" } }); });
  };
  return { live, frame, modes, editing, reselect, ready };
}

describe("useSelectMode", () => {
  it("turns picking on for an awake, editable draft once the frame is ready", async () => {
    const { live, editing, ready } = setup();
    renderHook(() => useSelectMode(live, editing, false));
    await act(async () => { await live.wake("ds-a"); });
    expect(live.isPicking()).toBe(false);
    await ready();
    expect(live.isPicking()).toBe(true);
  });

  it("turns picking back on after a preview recompiles the frame, then selects the edited element again", async () => {
    const { live, editing, ready, frame, reselect } = setup();
    renderHook(() => useSelectMode(live, editing, false));
    await act(async () => { await live.wake("ds-a"); });
    await ready();
    expect(live.isPicking()).toBe(true);
    reselect.value = "App.tsx:0:9";
    act(() => live.previewDraft("ds-a", source, 1, "tweak"));
    expect(live.isPicking()).toBe(false);
    await act(async () => { await vi.advanceTimersByTimeAsync(10); });
    expect(live.isPicking()).toBe(false);
    await ready();
    expect(live.isPicking()).toBe(true);
    expect(frame.postMessage).toHaveBeenLastCalledWith(expect.objectContaining({ type: "select-element", src: "App.tsx:0:9" }), "*");
    expect(reselect.value).toBeNull();
  });

  it("is off in Interact and back on when Interact ends", async () => {
    const { live, editing, ready } = setup();
    const view = renderHook(({ interact }) => useSelectMode(live, editing, interact), { initialProps: { interact: false } });
    await act(async () => { await live.wake("ds-a"); });
    await ready();
    expect(live.isPicking()).toBe(true);
    view.rerender({ interact: true });
    expect(live.isPicking()).toBe(false);
    view.rerender({ interact: false });
    expect(live.isPicking()).toBe(true);
  });

  it("never turns picking on for a read-only or undrafted screen", async () => {
    for (const [canEdit, drafted] of [[false, true], [true, false]] as const) {
      const { live, editing, ready, modes } = setup(canEdit, drafted);
      const view = renderHook(() => useSelectMode(live, editing, false));
      await act(async () => { await live.wake("ds-a"); });
      await ready();
      expect(live.isPicking()).toBe(false);
      expect(modes().includes(true)).toBe(false);
      view.unmount();
    }
  });
});
