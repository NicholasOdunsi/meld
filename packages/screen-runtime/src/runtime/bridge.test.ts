import { describe, expect, it, vi } from "vitest";
import { STUCK_MESSAGE } from "../constants";
import { FRAME_BRIDGE_SOURCE, FRAME_MESSAGE_SOURCE } from "./bridge";

type Handler = (event: { error?: unknown; message?: string; reason?: unknown; preventDefault: () => void; target?: unknown }) => void;
type BridgeWindow = {
  __orionReport: (error: unknown) => void;
  __orionReady: () => void;
  __orionStuck: () => void;
  orion: { goto: (key: unknown) => void };
  parent: { postMessage: ReturnType<typeof vi.fn> };
  addEventListener: (type: string, handler: Handler) => void;
};
function setup() {
  const handlers: Record<string, Handler> = {};
  const window = {
    parent: { postMessage: vi.fn() },
    addEventListener: (type: string, handler: Handler) => { handlers[type] = handler; },
  } as BridgeWindow;
  const document = { addEventListener: vi.fn((type: string, handler: Handler) => { handlers[type] = handler; }) };
  new Function("window", "document", FRAME_BRIDGE_SOURCE)(window, document);
  return { window, document, handlers };
}

describe("FRAME_BRIDGE_SOURCE", () => {
  it("reports stuck errors and truncates ordinary error messages", () => {
    const { window } = setup();
    window.__orionReport(new Error(`loop ${STUCK_MESSAGE}`));
    window.__orionReport(new Error("x".repeat(600)));
    window.__orionReport("plain error");
    expect(FRAME_MESSAGE_SOURCE).toBe("orion-frame");
    expect(window.parent.postMessage.mock.calls).toEqual([
      [{ source: FRAME_MESSAGE_SOURCE, type: "stuck" }, "*"],
      [{ source: FRAME_MESSAGE_SOURCE, type: "error", message: "x".repeat(500) }, "*"],
      [{ source: FRAME_MESSAGE_SOURCE, type: "error", message: "plain error" }, "*"],
    ]);
  });
  it("posts stuck directly when the loop guard calls its hook", () => {
    const { window } = setup();
    window.__orionStuck();
    expect(window.parent.postMessage.mock.calls).toEqual([[{ source: FRAME_MESSAGE_SOURCE, type: "stuck" }, "*"]]);
  });
  it("validates goto keys and signals readiness", () => {
    const { window } = setup();
    window.orion.goto("screen_2-a");
    for (const key of ["", "2bad", "Bad", "a".repeat(65), "bad/path", null, {}, 1]) window.orion.goto(key);
    window.__orionReady();
    expect(window.parent.postMessage.mock.calls).toEqual([
      [{ source: FRAME_MESSAGE_SOURCE, type: "goto", screenKey: "screen_2-a" }, "*"],
      [{ source: FRAME_MESSAGE_SOURCE, type: "ready" }, "*"],
    ]);
  });
  it("prevents global error and rejection defaults and reports their causes", () => {
    const { window, handlers } = setup();
    const preventDefault = vi.fn();
    handlers.error({ error: new Error("broken"), preventDefault });
    handlers.error({ message: "fallback", preventDefault });
    handlers.unhandledrejection({ reason: STUCK_MESSAGE, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(3);
    expect(window.parent.postMessage.mock.calls).toEqual([
      [{ source: FRAME_MESSAGE_SOURCE, type: "error", message: "broken" }, "*"],
      [{ source: FRAME_MESSAGE_SOURCE, type: "error", message: "fallback" }, "*"],
      [{ source: FRAME_MESSAGE_SOURCE, type: "stuck" }, "*"],
    ]);
  });
  it("captures data-goto clicks and blocks anchor navigation", () => {
    const { window, document, handlers } = setup();
    expect(document.addEventListener).toHaveBeenCalledWith("click", expect.any(Function), true);
    const preventDefault = vi.fn();
    const closest = vi.fn(() => ({ getAttribute: (name: string) => name === "data-goto" ? "details" : null }));
    handlers.click({ target: { closest }, preventDefault });
    expect(closest).toHaveBeenCalledWith("[data-goto],a[href]");
    handlers.click({ target: { closest: () => ({ getAttribute: () => null }) }, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(window.parent.postMessage).toHaveBeenCalledExactlyOnceWith({ source: FRAME_MESSAGE_SOURCE, type: "goto", screenKey: "details" }, "*");
    handlers.click({ target: { closest: () => null }, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    handlers.click({ target: { parentElement: { closest: () => ({ getAttribute: () => "invalid/key" }) } }, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(3);
    expect(window.parent.postMessage).toHaveBeenCalledTimes(1);
  });
  it("lets in-page #anchor links scroll natively without blocking or navigating", () => {
    const { window, handlers } = setup();
    const preventDefault = vi.fn();
    const anchor = (href: string, goto: string | null = null) => ({
      getAttribute: (name: string) => name === "href" ? href : name === "data-goto" ? goto : null,
    });
    handlers.click({ target: { closest: () => anchor("#section") }, preventDefault });
    handlers.click({ target: { closest: () => anchor("#") }, preventDefault });
    expect(preventDefault).not.toHaveBeenCalled();
    handlers.click({ target: { closest: () => anchor("https://example.test/") }, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(1);
    // data-goto on an anchor still navigates between screens.
    handlers.click({ target: { closest: () => anchor("#x", "details") }, preventDefault });
    expect(preventDefault).toHaveBeenCalledTimes(2);
    expect(window.parent.postMessage).toHaveBeenCalledExactlyOnceWith({ source: FRAME_MESSAGE_SOURCE, type: "goto", screenKey: "details" }, "*");
  });
});
