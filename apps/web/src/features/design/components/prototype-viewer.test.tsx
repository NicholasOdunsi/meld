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
    expect(wrapper().style.width).toBe("430px");
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
    //
    // The selection has to move off `screens[0]` (the default) first: an
    // unknown id falling through `effectiveSelectedId`'s own `screens[0]`
    // fallback would render "Register" too, identically to the fix, making
    // this pass against the old, unguarded `onScreenChanged: setSelectedId`
    // just as easily as the current one.
    render(<PrototypeViewer html="<html></html>" screenCount={2} screens={SCREENS} />);
    fireEvent.click(screen.getByRole("button", { name: /Register/ }));
    fireEvent.click(screen.getByRole("menuitem", { name: /Sign In/ }));
    expect(screen.getByRole("button", { name: /Sign In/ })).toBeInTheDocument();

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
    expect(screen.getByRole("button", { name: /Sign In/ })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /Register/ })).not.toBeInTheDocument();
  });

  it("keeps both controls together on the right, clear of the plane's toolbar", () => {
    // The pill used to sit top-left, where the plane's toolbar floats -- so the
    // toolbar covered the screen name. The toolbar sizes to its content and
    // expands, so no left-side offset is safe; the right edge is clear.
    render(<PrototypeViewer html="<html></html>" screenCount={2} screens={SCREENS} />);
    const chrome = screen
      .getByRole("button", { name: /mobile/i })
      .closest('[style*="position: absolute"]');
    expect(chrome).toHaveStyle({ top: "var(--spacing-3)", right: "var(--spacing-3)" });
    // Both live in that one group, so they cannot drift apart.
    expect(chrome).toContainElement(screen.getByTestId("prototype-screen-pill"));
  });

  it("shows a notice naming the dead button and clears it on navigation", () => {
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
          data: {
            type: "meld:action-unresolved",
            action: "go",
            label: "Continue to checkout",
          },
          source: frame.contentWindow,
        }),
      );
    });
    expect(
      screen.getByText('"Continue to checkout" isn\'t connected to a screen yet.'),
    ).toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen-changed", screenId: "s2" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(
      screen.queryByText('"Continue to checkout" isn\'t connected to a screen yet.'),
    ).not.toBeInTheDocument();
  });

  it("announces the notice politely, not as an alert", () => {
    // The plan is emphatic the tone is informational -- "The button is fine;
    // its destination has not been built." Banner's warning/error statuses
    // map to role="alert" (assertive); info maps to role="status" (polite).
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
          data: {
            type: "meld:action-unresolved",
            action: "go",
            label: "Continue to checkout",
          },
          source: frame.contentWindow,
        }),
      );
    });
    const notice = screen.getByText(
      '"Continue to checkout" isn\'t connected to a screen yet.',
    );
    expect(notice.closest('[role="status"]')).toBeInTheDocument();
    expect(notice.closest('[role="alert"]')).not.toBeInTheDocument();
    expect(screen.queryByRole("alert")).not.toBeInTheDocument();
  });

  it("can be dismissed, and a later different dead button still gets its own notice", () => {
    // The notice is transient but self-dismissing (no timer, which would
    // fight the clear-on-navigation logic) -- a close control is enough.
    // Dismissing must not permanently silence the notice for a later,
    // different dead button.
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
          data: {
            type: "meld:action-unresolved",
            action: "go",
            label: "Continue to checkout",
          },
          source: frame.contentWindow,
        }),
      );
    });
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(
      screen.queryByText('"Continue to checkout" isn\'t connected to a screen yet.'),
    ).not.toBeInTheDocument();

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:action-unresolved", action: "other", label: "Save draft" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(
      screen.getByText('"Save draft" isn\'t connected to a screen yet.'),
    ).toBeInTheDocument();
  });

  it("shows the generic notice when the dead button has no label", () => {
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
          data: { type: "meld:action-unresolved", action: "go", label: "" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(
      screen.getByText("That button isn't connected to a screen yet."),
    ).toBeInTheDocument();
  });

  it("replaces the notice when a different dead button is clicked", () => {
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
          data: {
            type: "meld:action-unresolved",
            action: "go",
            label: "Continue to checkout",
          },
          source: frame.contentWindow,
        }),
      );
    });
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:action-unresolved", action: "other", label: "Save draft" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(
      screen.queryByText('"Continue to checkout" isn\'t connected to a screen yet.'),
    ).not.toBeInTheDocument();
    expect(
      screen.getByText('"Save draft" isn\'t connected to a screen yet.'),
    ).toBeInTheDocument();
  });

  it("does not remount the iframe when the notice appears", () => {
    // A remount reloads the srcDoc and throws the prototype back to its
    // start screen -- the exact failure this notice must not cause.
    const { container } = render(
      <PrototypeViewer html="<html></html>" screenCount={2} screens={SCREENS} />,
    );
    const before = container.querySelector("iframe");
    const frame = before!;
    Object.defineProperty(frame, "contentWindow", {
      value: { postMessage: vi.fn() },
      configurable: true,
    });
    fireEvent.load(frame);
    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: {
            type: "meld:action-unresolved",
            action: "go",
            label: "Continue to checkout",
          },
          source: frame.contentWindow,
        }),
      );
    });
    expect(container.querySelector("iframe")).toBe(before);
  });

  it("keeps the notice clear of the screen pill and viewport toggle", () => {
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
          data: {
            type: "meld:action-unresolved",
            action: "go",
            label: "Continue to checkout",
          },
          source: frame.contentWindow,
        }),
      );
    });
    const notice = screen
      .getByText('"Continue to checkout" isn\'t connected to a screen yet.')
      .closest('[style*="position: absolute"]');
    expect(notice).not.toContainElement(screen.getByTestId("prototype-screen-pill"));
    expect(notice).not.toContainElement(
      screen.getByRole("button", { name: /mobile/i }),
    );
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

  it("reports corrected design-system overrides", () => {
    render(
      <PrototypeViewer
        html="<html></html>"
        screenCount={1}
        screens={[{ id: "s1", name: "One", formFactor: "desktop" }]}
        conformanceCorrections={3}
      />,
    );

    expect(
      screen.getByText("3 design-system overrides corrected."),
    ).toBeInTheDocument();
  });

  it("says nothing about a clean screen", () => {
    render(
      <PrototypeViewer
        html="<html></html>"
        screenCount={1}
        screens={[{ id: "s1", name: "One", formFactor: "desktop" }]}
        conformanceCorrections={0}
      />,
    );

    expect(screen.queryByText(/design-system overrides/)).toBeNull();
  });
});
