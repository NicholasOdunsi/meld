// @vitest-environment jsdom

import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { PrototypeViewer } from "./prototype-viewer";

afterEach(cleanup);

describe("PrototypeViewer", () => {
  it("renders prototype HTML with only the required sandbox capability", () => {
    const html = "<!doctype html><html><body>Prototype</body></html>";

    render(<PrototypeViewer html={html} screenCount={2} />);

    const frame = screen.getByTitle("Prototype preview (2 screens)");
    expect(frame).toHaveAttribute("sandbox", "allow-scripts");
    expect(frame.getAttribute("sandbox")).not.toContain("allow-same-origin");
    expect(frame).toHaveAttribute("srcdoc", html);
  });

  it("renders guidance instead of an iframe when no prototype is built", () => {
    render(<PrototypeViewer html={null} screenCount={0} />);

    expect(screen.getByText("No screens built yet")).toBeVisible();
    expect(
      screen.getByText("Generate a screen to see the prototype."),
    ).toBeVisible();
    expect(screen.queryByTitle(/Prototype preview/)).not.toBeInTheDocument();
  });

  it("fills the panel for a desktop screen", () => {
    render(<PrototypeViewer html="<p>x</p>" screenCount={1} />);
    const frame = screen.getByTitle("Prototype preview (1 screen)");
    expect(frame.style.width).toBe("100%");
  });

  it("sizes the frame to a phone when the showing screen is mobile", () => {
    render(<PrototypeViewer html="<p>x</p>" screenCount={2} />);
    const frame = screen.getByTitle(
      "Prototype preview (2 screens)",
    ) as HTMLIFrameElement;

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen", screenId: "s1", formFactor: "mobile" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(frame.style.width).toBe("390px");

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen", screenId: "s2", formFactor: "desktop" },
          source: frame.contentWindow,
        }),
      );
    });
    expect(frame.style.width).toBe("100%");
  });

  it("ignores screen messages that do not come from its own frame", () => {
    render(<PrototypeViewer html="<p>x</p>" screenCount={1} />);
    const frame = screen.getByTitle("Prototype preview (1 screen)");

    act(() => {
      window.dispatchEvent(
        new MessageEvent("message", {
          data: { type: "meld:screen", screenId: "s1", formFactor: "mobile" },
        }),
      );
    });
    expect(frame.style.width).toBe("100%");
  });
});
