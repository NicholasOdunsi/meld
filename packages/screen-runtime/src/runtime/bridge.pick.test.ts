// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { FRAME_BRIDGE_SOURCE } from "./bridge";
afterEach(() => {
  document.body.replaceChildren();
  vi.restoreAllMocks();
});
it("suppresses screen clicks while picking and accepts only parent mode messages", () => {
  // Isolated document keeps installed bridge listeners out of other fixtures.
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const win = frame.contentWindow!;
  win.document.body.innerHTML =
    '<a href="/away"><button data-orion-src="index.html:0:50">Pick</button></a>';
  const post = vi.spyOn(win.parent, "postMessage").mockImplementation(() => {});
  new Function("window", "document", FRAME_BRIDGE_SOURCE)(win, win.document);
  const button = win.document.querySelector("button")!;
  const click = vi.fn();
  button.addEventListener("click", click);
  const mode = (enabled: boolean, epoch: number, source: Window = win.parent) =>
    win.dispatchEvent(
      new MessageEvent("message", {
        source,
        data: { source: "orion-host", type: "pick-mode", enabled, epoch },
      }),
    );
  mode(true, 1, win);
  button.click();
  expect(click).toHaveBeenCalledOnce();
  click.mockClear();
  mode(true, 2);
  button.click();
  expect(click).not.toHaveBeenCalled();
  expect(post).toHaveBeenCalledWith(
    {
      source: "orion-frame",
      type: "picked",
      epoch: 2,
      src: "index.html:0:50",
      label: "Pick",
      computed: expect.any(Object),
    },
    "*",
  );
  mode(false, 1);
  button.click();
  expect(click).not.toHaveBeenCalled();
  mode(false, 3);
  button.click();
  expect(click).toHaveBeenCalledOnce();
  frame.remove();
});

const SRC = "index.html:0:80";
function install(html: string) {
  const frame = document.createElement("iframe");
  document.body.append(frame);
  const win = frame.contentWindow!;
  win.document.body.innerHTML = html;
  const post = vi.spyOn(win.parent, "postMessage").mockImplementation(() => {});
  new Function("window", "document", FRAME_BRIDGE_SOURCE)(win, win.document);
  const host = (data: Record<string, unknown>) =>
    win.dispatchEvent(
      new MessageEvent("message", {
        source: win.parent,
        data: { source: "orion-host", ...data },
      }),
    );
  const messages = (type: string) =>
    post.mock.calls.map((c) => c[0] as Record<string, unknown>).filter((m) => m.type === type);
  return { win, host, messages, post };
}
const BUTTON = `<button data-orion-src="${SRC}" style="font-size:20px;padding:12px">Go</button><p id="plain">none</p>`;

it("reports computed styles for a clicked element in pick mode", () => {
  const { win, host, messages } = install(BUTTON);
  host({ type: "pick-mode", enabled: true, epoch: 1 });
  win.document.querySelector("button")!.click();
  const picked = messages("picked");
  expect(picked).toHaveLength(1);
  const computed = picked[0]!.computed as Record<string, string>;
  expect(computed.fontSize).toBe("20");
  expect(computed.padding).toBe("12");
});

it("select-element posts the same picked message", () => {
  const { host, messages } = install(BUTTON);
  host({ type: "select-element", src: SRC, epoch: 1 });
  const picked = messages("picked");
  expect(picked).toHaveLength(1);
  expect(picked[0]!.src).toBe(SRC);
  const computed = picked[0]!.computed as Record<string, string>;
  expect(computed.fontSize).toBe("20");
  expect(computed.padding).toBe("12");
  host({ type: "select-element", src: "nope:0:1", epoch: 1 });
  expect(messages("picked")).toHaveLength(1);
});

it("draws the selection overlay but keeps it out of snapshots", () => {
  const { win, host } = install(BUTTON);
  host({ type: "select-element", src: SRC, epoch: 1 });
  expect(win.document.querySelector("[data-orion-overlay]")).not.toBeNull();
  const snapshot = (win as unknown as { __orionSnapshot: () => string }).__orionSnapshot();
  expect(snapshot).not.toContain("data-orion-overlay");
  expect(snapshot).toContain("Go");
});

it("clear-selection removes the overlay", () => {
  const { win, host } = install(BUTTON);
  host({ type: "select-element", src: SRC, epoch: 1 });
  host({ type: "clear-selection" });
  expect(win.document.querySelector("[data-orion-overlay]")).toBeNull();
});

it("clicking an untagged region in pick mode posts deselected and removes the overlay", () => {
  const { win, host, messages } = install(BUTTON);
  host({ type: "pick-mode", enabled: true, epoch: 1 });
  host({ type: "select-element", src: SRC, epoch: 1 });
  expect(win.document.querySelector("[data-orion-overlay]")).not.toBeNull();
  win.document.getElementById("plain")!.click();
  expect(messages("deselected")).toHaveLength(1);
  expect(win.document.querySelector("[data-orion-overlay]")).toBeNull();
});

it("caps every computed string", () => {
  const { host, messages } = install(
    `<button data-orion-src="${SRC}" style="font-family:${"a".repeat(300)};color:rgb(1, 2, 3)">Go</button>`,
  );
  host({ type: "select-element", src: SRC, epoch: 1 });
  const computed = messages("picked")[0]!.computed as Record<string, string>;
  const caps: Record<string, number> = {
    fontFamily: 120, fontWeight: 12, color: 40, backgroundColor: 40, display: 20,
    fontSize: 12, width: 12, height: 12, padding: 12, gap: 12, borderRadius: 12,
  };
  for (const [key, cap] of Object.entries(caps)) {
    expect(typeof computed[key]).toBe("string");
    expect(computed[key]!.length).toBeLessThanOrEqual(cap);
  }
  expect(Object.keys(computed).sort()).toEqual(Object.keys(caps).sort());
});

it("select-element adopts its epoch and ignores older epochs", () => {
  const { win, host, messages } = install(BUTTON);
  host({ type: "select-element", src: SRC, epoch: 5 });
  expect(messages("picked")).toHaveLength(1);
  expect(messages("picked")[0]!.epoch).toBe(5);
  const overlay = win.document.querySelector("[data-orion-overlay]");
  expect(overlay).not.toBeNull();
  host({ type: "clear-selection" });
  host({ type: "select-element", src: SRC, epoch: 4 });
  expect(messages("picked")).toHaveLength(1);
  expect(win.document.querySelector("[data-orion-overlay]")).toBeNull();
  host({ type: "select-element", src: SRC, epoch: 6 });
  expect(messages("picked")).toHaveLength(2);
  expect(messages("picked")[1]!.epoch).toBe(6);
});

// The frame is its own jsdom realm, so the stub goes on that realm's prototype.
function stubCanvas(win: Window, data: number[] | null) {
  vi.spyOn((win as unknown as typeof globalThis).HTMLCanvasElement.prototype, "getContext").mockImplementation((() =>
    data === null
      ? null
      : {
          clearRect() {},
          fillRect() {},
          fillStyle: "",
          getImageData: () => ({ data: Uint8ClampedArray.from(data) }),
        }) as never);
}
const SWATCH = (color: string) =>
  `<button data-orion-src="${SRC}" style="background-color:${color}">Go</button>`;
const pickedComputed = (html: string, canvas: number[] | null) => {
  const { win, host, messages } = install(html);
  stubCanvas(win, canvas);
  host({ type: "select-element", src: SRC, epoch: 1 });
  return messages("picked")[0]!.computed as Record<string, string>;
};

it("normalises colours to rgb() through a canvas", () => {
  const computed = pickedComputed(SWATCH("rgb(1, 2, 3)"), [18, 52, 86, 255]);
  expect(computed.backgroundColor).toBe("rgb(18, 52, 86)");
  expect(computed.color).toBe("rgb(18, 52, 86)");
});

it("reports a fully transparent colour as rgba(0, 0, 0, 0)", () => {
  expect(pickedComputed(SWATCH("rgb(1, 2, 3)"), [9, 9, 9, 0]).backgroundColor).toBe("rgba(0, 0, 0, 0)");
});

it("passes the original colour through when there is no canvas context", () => {
  const computed = pickedComputed(SWATCH("rgb(1, 2, 3)"), null);
  expect(computed.backgroundColor).toBe("rgb(1, 2, 3)");
  expect(computed.backgroundColor.length).toBeLessThanOrEqual(40);
});

it("passes the original colour through when the canvas cannot parse it", () => {
  const { win, host, messages } = install(SWATCH("rgb(1, 2, 3)"));
  vi.spyOn((win as unknown as typeof globalThis).HTMLCanvasElement.prototype, "getContext").mockImplementation((() => {
    // Mimics a canvas that ignores an unparseable fillStyle and keeps the base fill.
    let base = "";
    let style = "";
    return {
      clearRect() {},
      fillRect() {},
      get fillStyle() { return style; },
      set fillStyle(value: string) { if (value === "#000" || value === "#fff") base = value; style = value; },
      getImageData: () => ({ data: Uint8ClampedArray.from(base === "#000" ? [0, 0, 0, 255] : [255, 255, 255, 255]) }),
    };
  }) as never);
  host({ type: "select-element", src: SRC, epoch: 1 });
  const computed = messages("picked")[0]!.computed as Record<string, string>;
  expect(computed.backgroundColor).toBe("rgb(1, 2, 3)");
});
