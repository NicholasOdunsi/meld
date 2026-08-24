// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrototypeViewer } from "./prototype-viewer";

const SCREENS = [
  { id: "s1", name: "Register", formFactor: "desktop" as const },
  { id: "s2", name: "Sign In", formFactor: "desktop" as const },
];

afterEach(cleanup);

describe("PrototypeViewer", () => {
  it("shows the empty state when nothing is built", () => {
    render(<PrototypeViewer html={null} screenCount={0} screens={[]} hasUserFlow />);
    expect(screen.getByRole("button", { name: /user flow/i })).toBeInTheDocument();
  });

  it("constrains the frame to phone width in mobile, and restores it", () => {
    const { container } = render(
      <PrototypeViewer html="<html></html>" screenCount={2} screens={SCREENS} />,
    );
    const wrapper = () => container.querySelector<HTMLElement>('[data-testid="prototype-frame-wrapper"]')!;
    expect(wrapper().style.width).toBe("100%");
    fireEvent.click(screen.getByRole("button", { name: /mobile/i }));
    expect(wrapper().style.width).toBe("390px");
    fireEvent.click(screen.getByRole("button", { name: /desktop/i }));
    expect(wrapper().style.width).toBe("100%");
  });

  it("keeps the same iframe element across a viewport change", () => {
    // Remounting the frame would reload the document and throw the person back
    // to the start screen -- losing the screen they were actually looking at.
    const { container } = render(
      <PrototypeViewer html="<html></html>" screenCount={2} screens={SCREENS} />,
    );
    const before = container.querySelector("iframe");
    fireEvent.click(screen.getByRole("button", { name: /mobile/i }));
    expect(container.querySelector("iframe")).toBe(before);
  });

  it("follows a screen change that came from inside the prototype", () => {
    render(<PrototypeViewer html="<html></html>" screenCount={2} screens={SCREENS} />);
    const frame = document.querySelector("iframe")!;
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: vi.fn() },
      configurable: true,
    });
    fireEvent.load(frame);
    window.dispatchEvent(
      new MessageEvent("message", {
        data: { type: "meld:screen-changed", screenId: "s2" },
        source: frame.contentWindow,
      }),
    );
    expect(screen.getByRole("button", { name: /Sign In/ })).toBeInTheDocument();
  });
});
