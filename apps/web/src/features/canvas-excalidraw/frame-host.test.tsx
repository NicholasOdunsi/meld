// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("tells the board when the pointer enters and leaves the live iframe", () => {
    const live = fakeLive({ phase: "running", screenId: "welcome", attempt: 2, source, document: "<p>live</p>", errors: [] });
    const onLivePointer = vi.fn();
    const store = createScreenStore();
    store.set({ id: "welcome", rev: 1, html: "<h1>Hi</h1>" });
    const { container } = render(<FrameHost screenId="welcome" store={store} live={live} onLivePointer={onLivePointer} />);
    const iframe = container.querySelector("iframe[data-orion-live='welcome']") as HTMLIFrameElement;
    fireEvent.pointerEnter(iframe);
    fireEvent.pointerLeave(iframe);
    expect(onLivePointer.mock.calls).toEqual([[iframe, true], [iframe, false]]);
  });

  it("keeps a plain wheel over the live iframe from reaching the board, but lets ctrl/cmd+wheel (zoom) through", () => {
    // WebKit hands a wheel the screen did not use to the parent page as a wheel on the iframe element,
    // and Excalidraw pans the board for wheels on iframes. The board must never see it.
    const live = fakeLive({ phase: "running", screenId: "welcome", attempt: 2, source, document: "<p>live</p>", errors: [] });
    const { container } = setup(live);
    const iframe = container.querySelector("iframe[data-orion-live='welcome']") as HTMLIFrameElement;
    const board = vi.fn();
    container.addEventListener("wheel", board);
    const plain = new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true });
    iframe.dispatchEvent(plain);
    expect(board).not.toHaveBeenCalled();
    expect(plain.defaultPrevented).toBe(true);
    iframe.dispatchEvent(new WheelEvent("wheel", { deltaX: 40, shiftKey: true, bubbles: true, cancelable: true }));
    expect(board).not.toHaveBeenCalled();
    const pinch = new WheelEvent("wheel", { deltaY: -10, ctrlKey: true, bubbles: true, cancelable: true });
    iframe.dispatchEvent(pinch);
    iframe.dispatchEvent(new WheelEvent("wheel", { deltaY: -10, metaKey: true, bubbles: true, cancelable: true }));
    expect(board).toHaveBeenCalledTimes(2);
    expect(pinch.defaultPrevented).toBe(false);
  });

  it("leaves a wheel over a sleeping screen to the board", () => {
    const { container } = setup();
    const board = vi.fn();
    container.addEventListener("wheel", board);
    container.querySelector("iframe")!.dispatchEvent(new WheelEvent("wheel", { deltaY: 120, bubbles: true, cancelable: true }));
    expect(board).toHaveBeenCalledOnce();
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
