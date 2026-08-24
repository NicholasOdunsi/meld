// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { uploadMock, hookState } = vi.hoisted(() => ({
  uploadMock: vi.fn(),
  hookState: {
    status: "idle" as
      | "idle"
      | "uploading"
      | "distilling"
      | "resolved"
      | "failed",
    message: null as string | null,
    phase: null as
      | null
      | "uploading"
      | "queued"
      | "reading"
      | "done"
      | "failed",
  },
}));
vi.mock("../use-design-profile-distillation", () => ({
  useDesignProfileDistillation: () => ({ ...hookState, upload: uploadMock }),
}));
vi.mock("next/navigation", () => ({
  useParams: () => ({ workspaceId: "ws-1" }),
}));

import { DesignSystemBanner } from "./design-system-banner";

afterEach(() => {
  cleanup();
  hookState.status = "idle";
  hookState.message = null;
  hookState.phase = null;
});

describe("DesignSystemBanner", () => {
  it("shows the upload CTA in idle state", () => {
    render(<DesignSystemBanner roomId="room-1" />);
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
  });

  describe('variant="roomy" (the Room composer, which has width to spend)', () => {
    function renderRoomy() {
      render(<DesignSystemBanner roomId="room-1" variant="roomy" />);
      return screen.getByTestId("design-system-banner");
    }

    it("says what a design system buys you, under the title", () => {
      renderRoomy();
      expect(screen.getByText("No design system yet")).toBeInTheDocument();
      expect(
        screen.getByText(/screens will each invent their own look/i),
      ).toBeInTheDocument();
    });

    it("keeps the status icon the app's other banners show", () => {
      const banner = renderRoomy();
      const iconSlot = banner.querySelector('[aria-hidden="true"]');
      expect(iconSlot?.querySelector("svg")).toBeTruthy();
    });

    it("does not wear the composer's blue, which it sits directly on top of", () => {
      const banner = renderRoomy();
      // A focused ChatComposer draws a blue ring. An info banner is blue too,
      // so stacked they read as one control rather than a notice above a
      // field. Warning is the honest status anyway: nothing has failed, but
      // generating without a design system does cost you something.
      expect(banner.querySelector('[data-status="info"]')).toBeNull();
      expect(banner.querySelector('[data-status="warning"]')).toBeTruthy();
    });

    it("leads with a primary action, not a muted one", () => {
      renderRoomy();
      const upload = screen.getByRole("button", { name: "Upload" });
      expect(upload.className).toMatch(/primary/i);
    });

    it("is inset from its container rather than sitting hard against the edge", () => {
      const banner = renderRoomy();
      expect(banner.style.paddingTop).toBe("var(--spacing-2)");
      expect(banner.style.paddingLeft).toBe("var(--spacing-2)");
    });

    it("paints over the agent peeking up behind the composer", () => {
      const banner = renderRoomy();
      // ComposerAgentPeek is absolutely positioned at z-index 0 and comes
      // later in the DOM, so by default the mascot lands on top of this
      // banner's corner. The banner needs its own stacking position to cover
      // it -- z-index alone does nothing to a statically positioned box.
      expect(banner.style.position).toBe("relative");
      expect(banner.style.zIndex).toBe("1");
    });

    it("sits 8px above the composer, not a whole blank row away", () => {
      const banner = renderRoomy();
      // The composer's own VStack already contributes spacing-2 (8px) below
      // this banner, which is the whole intended gap -- so the banner adds
      // nothing of its own. Asserted because zero here only makes sense
      // against that 8px: change the composer's gap and this is the reminder
      // to re-check the pair.
      expect(banner.style.paddingBottom).toBe("var(--spacing-0)");
    });
  });

  describe('variant="compact" (the narrow Canvas Agents panel)', () => {
    // The long label and the icon were dropped here on purpose: in that column
    // the header wrapped one word per line. The roomy variant must not drag
    // them back by making its own choices the default.
    it("keeps its title on one line, with no icon and no description", () => {
      render(<DesignSystemBanner roomId="room-1" />);
      const banner = screen.getByTestId("design-system-banner");
      expect(
        screen.queryByText(/screens will each invent their own look/i),
      ).not.toBeInTheDocument();
      const iconSlot = banner.querySelector('[aria-hidden="true"]');
      expect(iconSlot?.querySelector("svg")).toBeFalsy();
      expect(banner.style.paddingTop).toBe("");
    });
  });

  it("dismissing hides the banner for this render", () => {
    render(<DesignSystemBanner roomId="room-1" />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByRole("button", { name: "Upload" })).not.toBeInTheDocument();
  });

  it("shows a distilling status with a spinner", () => {
    hookState.status = "distilling";
    hookState.phase = "queued";
    render(<DesignSystemBanner roomId="room-1" />);
    expect(screen.getByText(/distilling your design system/i)).toBeInTheDocument();
  });

  // A distillation runs for minutes. One unchanging line could not tell a job
  // that was working from one that was wedged, and the wait ended with the
  // banner simply vanishing -- never saying it had worked.
  describe("while it is running", () => {
    it("shows every step, not just the current one", () => {
      hookState.status = "distilling";
      hookState.phase = "reading";
      render(<DesignSystemBanner roomId="room-1" />);
      expect(screen.getByTestId("distill-steps")).toBeInTheDocument();
      expect(screen.getByText("Uploading your file")).toBeInTheDocument();
      expect(screen.getByText("Waiting for your connector")).toBeInTheDocument();
      expect(screen.getByText("Reading your design system")).toBeInTheDocument();
    });

    it("advances as the task is picked up", () => {
      hookState.status = "distilling";
      hookState.phase = "queued";
      const { rerender } = render(<DesignSystemBanner roomId="room-1" />);
      // Waiting: the connector step is the live one and reading has not begun.
      expect(screen.getByText("Waiting for your connector").className).not.toBe(
        screen.getByText("Reading your design system").className,
      );

      hookState.phase = "reading";
      rerender(<DesignSystemBanner roomId="room-1" />);
      // Picked up: now the two have swapped which one reads as active.
      expect(screen.getByText("Reading your design system")).toBeInTheDocument();
    });

    it("offers no Upload while one is already running", () => {
      hookState.status = "distilling";
      hookState.phase = "reading";
      render(<DesignSystemBanner roomId="room-1" />);
      expect(
        screen.queryByRole("button", { name: "Upload" }),
      ).not.toBeInTheDocument();
    });
  });

  describe("when it finishes", () => {
    function renderDone() {
      hookState.status = "resolved";
      hookState.phase = "done";
      render(<DesignSystemBanner roomId="room-1" variant="roomy" />);
      return screen.getByTestId("design-system-banner");
    }

    it("says so, rather than just disappearing", () => {
      renderDone();
      expect(screen.getByText("Design system ready")).toBeInTheDocument();
    });

    it("reads as success, not as the amber ask it started from", () => {
      const banner = renderDone();
      expect(banner.querySelector('[data-status="success"]')).toBeTruthy();
      expect(banner.querySelector('[data-status="warning"]')).toBeNull();
    });

    it("offers a way to go and look at what was made", () => {
      renderDone();
      // A real link, so it can be middle-clicked or opened in a new tab
      // rather than only firing a handler.
      expect(
        screen.getByRole("link", { name: "View design system" }),
      ).toHaveAttribute("href", "/ws-1/design-system");
    });
  });

  it("shows the failure message and an idle retry CTA", () => {
    hookState.status = "failed";
    hookState.message = "That file has no readable text.";
    render(<DesignSystemBanner roomId="room-1" />);
    expect(screen.getByText("That file has no readable text.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Upload" })).toBeInTheDocument();
    hookState.status = "idle";
    hookState.message = null;
  });

  // jsdom's Blob (which File extends) lacks arrayBuffer() in this project's
  // jsdom version; the same polyfill user-flow-trial-canvas.test.tsx and
  // user-flow-trial-canvas.e2e.test.tsx use for the same reason.
  if (typeof Blob !== "undefined" && !Blob.prototype.arrayBuffer) {
    Blob.prototype.arrayBuffer = function arrayBuffer(this: Blob) {
      return new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = () => reject(reader.error);
        reader.readAsArrayBuffer(this);
      });
    };
  }

  it("accepts a .md file even when the browser reports an empty MIME type", async () => {
    render(<DesignSystemBanner roomId="room-1" />);
    const input = document.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(["# Brand"], "brand.md", { type: "" });
    fireEvent.change(input, { target: { files: [file] } });
    await waitFor(() => {
      expect(uploadMock).toHaveBeenCalledWith(
        expect.objectContaining({ fileName: "brand.md", mimeType: "text/markdown" }),
      );
    });
  });
});
