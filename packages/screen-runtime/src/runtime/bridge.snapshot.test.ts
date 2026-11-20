// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { STUCK_MESSAGE, TAG_ATTRIBUTE } from "../constants";
import { FRAME_BRIDGE_SOURCE, FRAME_MESSAGE_SOURCE, HOST_MESSAGE_SOURCE } from "./bridge";

type Handler = (event: unknown) => void;

function setup(markup: string) {
  document.head.innerHTML = `<meta http-equiv="Content-Security-Policy" content="default-src 'none'"><style>p{color:red}</style><script>window.loaded = true</script>`;
  document.body.innerHTML = markup;
  const handlers: Record<string, Handler> = {};
  const parent = { postMessage: vi.fn() };
  const frameWindow = {
    parent,
    addEventListener: (type: string, handler: Handler) => { handlers[type] = handler; },
  } as Record<string, unknown>;
  const frameDocument = { addEventListener: vi.fn(), documentElement: document.documentElement };
  new Function("window", "document", FRAME_BRIDGE_SOURCE)(frameWindow, frameDocument);
  return { frameWindow, parent, handlers };
}

afterEach(() => { document.head.innerHTML = ""; document.body.innerHTML = ""; });

describe("frame bridge snapshots", () => {
  it("copies the rendered page without scripts, CSP, handlers or source tags", () => {
    const { frameWindow } = setup(`<main ${TAG_ATTRIBUTE}="App.tsx:0:9"><button class="p-2" onclick="go()">Count 1</button></main>`);
    const html = (frameWindow.__orionSnapshot as () => string)();
    expect(html.startsWith("<!doctype html><html>")).toBe(true);
    expect(html).toContain("<style>p{color:red}</style>");
    expect(html).toContain('<button class="p-2">Count 1</button>');
    for (const removed of ["<script", "onclick", TAG_ATTRIBUTE, "Content-Security-Policy"]) expect(html).not.toContain(removed);
    // The live page keeps everything.
    expect(document.querySelector("button")?.getAttribute("onclick")).toBe("go()");
    expect(document.querySelectorAll("script")).toHaveLength(1);
  });

  it("answers snapshot requests from the parent only", () => {
    const { parent, handlers } = setup("<p>Hi</p>");
    handlers.message({ source: {}, data: { source: HOST_MESSAGE_SOURCE, type: "snapshot" } });
    handlers.message({ source: parent, data: { source: "someone-else", type: "snapshot" } });
    handlers.message({ source: parent, data: null });
    expect(parent.postMessage).not.toHaveBeenCalled();
    handlers.message({ source: parent, data: { source: HOST_MESSAGE_SOURCE, type: "snapshot" } });
    expect(parent.postMessage).toHaveBeenCalledExactlyOnceWith(
      { source: FRAME_MESSAGE_SOURCE, type: "snapshot", html: expect.stringContaining("<p>Hi</p>") }, "*",
    );
  });

  it("forwards Escape unless the screen handled it", () => {
    const { parent, handlers } = setup("<p>Hi</p>");
    handlers.keydown({ key: "Escape", defaultPrevented: true });
    handlers.keydown({ key: "a", defaultPrevented: false });
    expect(parent.postMessage).not.toHaveBeenCalled();
    handlers.keydown({ key: "Escape", defaultPrevented: false });
    expect(parent.postMessage).toHaveBeenCalledExactlyOnceWith({ source: FRAME_MESSAGE_SOURCE, type: "escape" }, "*");
  });

  it("reports a stuck loop as a single stuck message, never also an error", () => {
    const { parent, handlers } = setup("<p>Hi</p>");
    const event = { error: new Error(STUCK_MESSAGE), message: STUCK_MESSAGE, preventDefault: vi.fn() };
    handlers.error(event);
    handlers.unhandledrejection({ reason: new Error(STUCK_MESSAGE), preventDefault: vi.fn() });
    expect(parent.postMessage.mock.calls).toEqual([
      [{ source: FRAME_MESSAGE_SOURCE, type: "stuck" }, "*"],
      [{ source: FRAME_MESSAGE_SOURCE, type: "stuck" }, "*"],
    ]);
  });
});
