// @vitest-environment jsdom
import { renderHook, act } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { usePrototypeFrame } from "./use-prototype-frame";

function fakeFrame() {
  const postMessage = vi.fn();
  const contentWindow = { postMessage } as unknown as Window;
  return {
    postMessage,
    contentWindow,
    ref: { current: { contentWindow } as unknown as HTMLIFrameElement },
  };
}

describe("usePrototypeFrame", () => {
  it("posts a navigate message once the frame has loaded", () => {
    const frame = fakeFrame();
    const { result } = renderHook(() =>
      usePrototypeFrame({ frameRef: frame.ref, onScreenChanged: vi.fn() }),
    );
    act(() => result.current.handleLoad());
    act(() => result.current.navigate("s2"));
    expect(frame.postMessage).toHaveBeenCalledWith(
      { type: "meld:navigate", screenId: "s2" },
      "*",
    );
  });

  it("queues a navigate sent before load and flushes it on load", () => {
    // Selecting a screen while the frame is still loading must not be dropped
    // silently -- that reads as a dead control.
    const frame = fakeFrame();
    const { result } = renderHook(() =>
      usePrototypeFrame({ frameRef: frame.ref, onScreenChanged: vi.fn() }),
    );
    act(() => result.current.navigate("s3"));
    expect(frame.postMessage).not.toHaveBeenCalled();
    act(() => result.current.handleLoad());
    expect(frame.postMessage).toHaveBeenCalledWith(
      { type: "meld:navigate", screenId: "s3" },
      "*",
    );
  });

  it("reports a screen change coming from inside the prototype", () => {
    const frame = fakeFrame();
    const onScreenChanged = vi.fn();
    renderHook(() => usePrototypeFrame({ frameRef: frame.ref, onScreenChanged }));
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen-changed", screenId: "s9" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(onScreenChanged).toHaveBeenCalledWith("s9");
  });

  it("ignores a message from any window that is not our frame", () => {
    // The frame is sandboxed without allow-same-origin, so its origin is
    // opaque and arrives as "null" -- origin cannot be used to authenticate.
    // Source identity is the only thing that can.
    const frame = fakeFrame();
    const onScreenChanged = vi.fn();
    renderHook(() => usePrototypeFrame({ frameRef: frame.ref, onScreenChanged }));
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen-changed", screenId: "evil" },
          source: {} as Window,
        }),
      );
    });
    expect(onScreenChanged).not.toHaveBeenCalled();
  });

  it("ignores a malformed payload from our own frame", () => {
    const frame = fakeFrame();
    const onScreenChanged = vi.fn();
    renderHook(() => usePrototypeFrame({ frameRef: frame.ref, onScreenChanged }));
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen-changed", screenId: 42 },
          source: frame.contentWindow,
        }),
      );
    });
    expect(onScreenChanged).not.toHaveBeenCalled();
  });

  it("fires onUnresolved for a well-formed message from our frame", () => {
    const frame = fakeFrame();
    const onUnresolved = vi.fn();
    renderHook(() =>
      usePrototypeFrame({ frameRef: frame.ref, onScreenChanged: vi.fn(), onUnresolved }),
    );
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "meld:action-unresolved",
            action: "go",
            label: "Continue to checkout",
          },
          source: frame.contentWindow,
        }),
      );
    });
    expect(onUnresolved).toHaveBeenCalledWith({
      action: "go",
      label: "Continue to checkout",
    });
  });

  it("ignores an unresolved message from a window that is not our frame", () => {
    const frame = fakeFrame();
    const onUnresolved = vi.fn();
    renderHook(() =>
      usePrototypeFrame({ frameRef: frame.ref, onScreenChanged: vi.fn(), onUnresolved }),
    );
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "meld:action-unresolved",
            action: "go",
            label: "Continue to checkout",
          },
          source: {} as Window,
        }),
      );
    });
    expect(onUnresolved).not.toHaveBeenCalled();
  });
});
