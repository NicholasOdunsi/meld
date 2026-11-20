// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameHost } from "./frame-host";
import type { LiveController } from "./live/live-controller";
import type { LiveState } from "./live/live-state";
import { createScreenStore } from "./screen-store";

afterEach(cleanup);

const source = { kind: "react" as const, files: { "App.tsx": "x" }, entry: "App.tsx" };

function fakeLive(state: LiveState) {
  return {
    getState: () => state,
    subscribe: () => () => {},
    attachFrame: vi.fn(),
    reload: vi.fn(),
  } as unknown as LiveController & { attachFrame: ReturnType<typeof vi.fn>; reload: ReturnType<typeof vi.fn> };
}

function setup(live?: LiveController, onShowCode?: () => void) {
  const store = createScreenStore();
  store.set({ id: "welcome", rev: 1, html: "<h1>Hi</h1>" });
  const view = render(<FrameHost screenId="welcome" store={store} live={live} onShowCode={onShowCode} />);
  return { ...view, store };
}

describe("FrameHost", () => {
  it("renders a static page with scripts disabled", () => {
    const iframe = setup().container.querySelector("iframe")!;
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(iframe.getAttribute("srcdoc")).toContain("script-src 'none'");
    expect(iframe.getAttribute("srcdoc")).toContain("<h1>Hi</h1>");
    expect(iframe.style.pointerEvents).toBe("none");
  });

  it("shows the thumbnail with a spinner while the screen wakes", () => {
    setup(fakeLive({ phase: "compiling", screenId: "welcome", attempt: 1 }));
    expect(screen.getByText("Opening screen…")).toBeInTheDocument();
    expect(document.querySelector("iframe[data-orion-frame='welcome']")).not.toBeNull();
  });

  it("runs the live document with scripts and pointer events, and reports its window", () => {
    const live = fakeLive({ phase: "running", screenId: "welcome", attempt: 2, source, document: "<p>live</p>", errors: [] });
    const iframe = setup(live).container.querySelector("iframe[data-orion-live='welcome']") as HTMLIFrameElement;
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("srcdoc")).toBe("<p>live</p>");
    expect(iframe.style.pointerEvents).toBe("auto");
    expect(live.attachFrame).toHaveBeenCalledWith(iframe.contentWindow);
  });

  it("keeps other screens as pictures while one is live", () => {
    setup(fakeLive({ phase: "running", screenId: "other", attempt: 1, source, document: "<p>live</p>", errors: [] }));
    expect(document.querySelector("iframe[data-orion-live]")).toBeNull();
  });

  it("replaces a stuck frame with the overlay", async () => {
    const live = fakeLive({ phase: "stopped", reason: "stuck", screenId: "welcome", attempt: 1, source, document: "<p>live</p>", errors: [] });
    const onShowCode = vi.fn();
    setup(live, onShowCode);
    expect(document.querySelector("iframe")).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Reload" }));
    await userEvent.click(screen.getByRole("button", { name: "Show code" }));
    expect(live.reload).toHaveBeenCalledOnce();
    expect(onShowCode).toHaveBeenCalledOnce();
  });
  it("keeps the window attached across ready and remounts it on reload without stale detach", () => {
    let state: LiveState = { phase: "loading", screenId: "welcome", attempt: 1, source, document: "<p>live</p>", errors: [] };
    const live = fakeLive(state);
    live.getState = () => state;
    const { container, rerender, store } = setup(live);
    const first = container.querySelector("iframe")!;
    live.attachFrame.mockClear();
    state = { ...state, phase: "running" };
    rerender(<FrameHost screenId="welcome" store={store} live={live} />);
    expect(container.querySelector("iframe")).toBe(first);
    expect(live.attachFrame).not.toHaveBeenCalled();
    state = { ...state, phase: "loading", attempt: 2 };
    rerender(<FrameHost screenId="welcome" store={store} live={live} />);
    const second = container.querySelector("iframe")!;
    expect(second).not.toBe(first);
    expect(live.attachFrame.mock.calls).toEqual([[second.contentWindow]]);
  });

  it("does not let an old host detach a newer screen's window", () => {
    let state: LiveState = { phase: "running", screenId: "welcome", attempt: 1, source, document: "<p>live</p>", errors: [] };
    const live = fakeLive(state);
    live.getState = () => state;
    const old = setup(live);
    state = { ...state, screenId: "other", attempt: 2 };
    const newer = render(<FrameHost screenId="other" store={old.store} live={live} />);
    const nextFrame = newer.container.querySelector("iframe")!;
    live.attachFrame.mockClear();
    old.unmount();
    expect(live.attachFrame).not.toHaveBeenCalled();
    newer.unmount();
    expect(live.attachFrame).toHaveBeenCalledWith(null);
    expect(nextFrame.isConnected).toBe(false);
  });

});
