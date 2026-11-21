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
    fontSize: 20, width: 20, height: 20, padding: 20, gap: 20, borderRadius: 20,
  };
  for (const [key, cap] of Object.entries(caps)) {
    expect(typeof computed[key]).toBe("string");
    expect(computed[key]!.length).toBeLessThanOrEqual(cap);
  }
  expect(Object.keys(computed).sort()).toEqual(Object.keys(caps).sort());
});
