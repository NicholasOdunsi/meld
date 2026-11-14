// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { FrameHost } from "./frame-host";
import { createScreenStore } from "./screen-store";

afterEach(cleanup);

function setup() {
  const store = createScreenStore();
  store.set({ id: "welcome", rev: 1, html: "<h1>Hi</h1>" });
  store.set({ id: "login", rev: 1, html: "<h1>Login</h1>" });
  const view = render(<FrameHost screenId="welcome" store={store} />);
  return { iframe: view.container.querySelector("iframe")! };
}

describe("FrameHost", () => {
  it("renders a static page with scripts disabled", () => {
    const { iframe } = setup();
    expect(iframe.getAttribute("sandbox")).toBe("");
    expect(iframe.getAttribute("srcdoc")).toContain("Content-Security-Policy");
    expect(iframe.getAttribute("srcdoc")).toContain("script-src 'none'");
    expect(iframe.getAttribute("srcdoc")).toContain("<h1>Hi</h1>");
  });
});
