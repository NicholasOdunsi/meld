// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { FrameHost } from "./frame-host";
import { createScreenStore } from "./screen-store";

afterEach(cleanup);

function setup() {
  const store = createScreenStore();
  store.set({ id: "welcome", rev: 1, html: "<h1>Hi</h1>" });
  store.set({ id: "login", rev: 1, html: "<h1>Login</h1>" });
  const onNavigate = vi.fn();
  const view = render(<FrameHost screenId="welcome" store={store} onNavigate={onNavigate} />);
  return { iframe: view.container.querySelector("iframe")!, onNavigate };
}

const post = (source: unknown, data: unknown) =>
  window.dispatchEvent(new MessageEvent("message", { source: source as MessageEventSource, data }));

describe("FrameHost", () => {
  it("renders the page in a scripts-only sandbox with a CSP", () => {
    const { iframe } = setup();
    expect(iframe.getAttribute("sandbox")).toBe("allow-scripts");
    expect(iframe.getAttribute("srcdoc")).toContain("Content-Security-Policy");
    expect(iframe.getAttribute("srcdoc")).toContain("<h1>Hi</h1>");
  });
  it("navigates on a valid goto from its own window", () => {
    const { iframe, onNavigate } = setup();
    post(iframe.contentWindow, { source: "orion-frame", type: "goto", screenKey: "login" });
    expect(onNavigate).toHaveBeenCalledWith("login");
  });
  it("ignores messages from elsewhere and unknown screens", () => {
    const { iframe, onNavigate } = setup();
    post(window, { source: "orion-frame", type: "goto", screenKey: "login" });
    post(iframe.contentWindow, { source: "orion-frame", type: "goto", screenKey: "ghost" });
    expect(onNavigate).not.toHaveBeenCalled();
  });
});
