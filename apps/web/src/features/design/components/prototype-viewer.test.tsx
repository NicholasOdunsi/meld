// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen } from "@testing-library/react";
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

  it("centers the empty state within the pane instead of pinning it to the top", () => {
    // Astryx's `EmptyState` has no height or `justify-content` of its own --
    // without a sized, centred wrapper around it, it sits at the top of the
    // pane rather than centred, which is what the old viewer avoided with
    // exactly this `VStack`.
    const { container } = render(
      <PrototypeViewer html={null} screenCount={0} screens={[]} hasUserFlow />,
    );
    const emptyState = container.querySelector(".astryx-empty-state");
    const wrapper = emptyState?.parentElement;
    expect(wrapper).toHaveClass("astryx-stack");
    expect(wrapper).toHaveStyle({ width: "100%", height: "100%" });
  });

  it("passes the in-flight state through to the empty state's starting points", () => {
    render(
      <PrototypeViewer html={null} screenCount={0} screens={[]} hasUserFlow isStarting />,
    );
    expect(
      screen.getByRole("button", { name: /user flow/i }),
    ).toBeDisabled();
  });

  it("renders the frame with an accessible name and only the required sandbox capability", () => {
    const html = "<!doctype html><html><body>Prototype</body></html>";
    render(<PrototypeViewer html={html} screenCount={2} screens={SCREENS} />);

    const frame = screen.getByTitle("Prototype preview (2 screens)");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    // A frame sandboxed with both `allow-scripts` and `allow-same-origin` can
    // escape its own sandbox -- this pins that the two are never granted
    // together.
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(frame).toHaveAttribute("srcdoc", html);
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
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen-changed", screenId: "s2" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(screen.getByRole("button", { name: /Sign In/ })).toBeInTheDocument();
  });

  it("ignores a screen change naming a screen that is not in the list", () => {
    // The spec's error table: ignore it and keep the current label, never
    // render a name not in `screens` -- not reachable today (the prototype
    // only ever names screens it was built with), but a stated contract.
    render(<PrototypeViewer html="<html></html>" screenCount={2} screens={SCREENS} />);
    const frame = document.querySelector("iframe")!;
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: vi.fn() },
      configurable: true,
    });
    fireEvent.load(frame);
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen-changed", screenId: "does-not-exist" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(screen.getByRole("button", { name: /Register/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Sign In/ })).not.toBeInTheDocument();
  });

  it("insets the screen pill and viewport toggle off the generated screen's own corners", () => {
    // Flush against the frame, they sit directly on top of whatever the
    // generated screen draws in its own corners -- for a branded-sidebar
    // screen, that is the logo.
    render(<PrototypeViewer html="<html></html>" screenCount={2} screens={SCREENS} />);
    const pillWrapper = screen.getByTestId("prototype-screen-pill").parentElement;
    const toggleWrapper = screen
      .getByRole("button", { name: /mobile/i })
      .closest('[style*="position: absolute"]');
    expect(pillWrapper).toHaveStyle({ top: "var(--spacing-3)", left: "var(--spacing-3)" });
    expect(toggleWrapper).toHaveStyle({ top: "var(--spacing-3)", right: "var(--spacing-3)" });
  });

  it("falls back to the first screen when the selected one is no longer in the list", () => {
    const THREE_SCREENS = [
      ...SCREENS,
      { id: "s3", name: "Dashboard", formFactor: "desktop" as const },
    ];
    const { rerender } = render(
      <PrototypeViewer html="<html></html>" screenCount={3} screens={THREE_SCREENS} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /Register/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Sign In/ }));
    expect(screen.getByRole("button", { name: /Sign In/ })).toBeInTheDocument();

    // The selected screen (s2) is deleted out from under the pane -- e.g. an
    // agent edit landing while it was on screen. Two screens remain, so the
    // pill still renders (it hides itself below two) but must not still
    // claim the deleted one is selected.
    rerender(
      <PrototypeViewer
        html="<html></html>"
        screenCount={2}
        screens={[SCREENS[0], THREE_SCREENS[2]]}
      />,
    );

    expect(screen.queryByRole("button", { name: /Sign In/ })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Register/ })).toBeInTheDocument();
  });
});
