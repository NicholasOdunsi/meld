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
