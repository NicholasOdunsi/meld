// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { postToNative, registerNativeHandlers } from "./bridge";

type OrionWindow = Window & { webkit?: unknown; __orionNative?: unknown };

afterEach(() => {
  delete (window as OrionWindow).webkit;
  delete (window as OrionWindow).__orionNative;
});

describe("native bridge", () => {
  it("does nothing outside the Mac app", () => {
    expect(() => postToNative({ v: 1, type: "ready", workspaceId: null })).not.toThrow();
  });

  it("posts messages to the orion handler inside the app", () => {
    const postMessage = vi.fn();
    (window as OrionWindow).webkit = { messageHandlers: { orion: { postMessage } } };
    postToNative({ v: 1, type: "notify", title: "Screens ready", body: "In Home", path: "/w/rooms/r" });
    expect(postMessage).toHaveBeenCalledWith({ v: 1, type: "notify", title: "Screens ready", body: "In Home", path: "/w/rooms/r" });
  });

  it("swallows handler errors", () => {
    (window as OrionWindow).webkit = { messageHandlers: { orion: { postMessage: () => { throw new Error("gone"); } } } };
    expect(() => postToNative({ v: 1, type: "ready", workspaceId: null })).not.toThrow();
  });

  it("registers and unregisters handlers the app can call", () => {
    const requestShelfConnect = vi.fn();
    const unregister = registerNativeHandlers({ requestShelfConnect });
    (window as unknown as { __orionNative: { requestShelfConnect: () => void } }).__orionNative.requestShelfConnect();
    expect(requestShelfConnect).toHaveBeenCalledOnce();
    unregister();
    expect((window as OrionWindow).__orionNative).toBeUndefined();
  });
});
