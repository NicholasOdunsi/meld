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
  },
}));
vi.mock("../use-design-profile-distillation", () => ({
  useDesignProfileDistillation: () => ({ ...hookState, upload: uploadMock }),
}));

import { DesignSystemBanner } from "./design-system-banner";

afterEach(cleanup);

describe("DesignSystemBanner", () => {
  it("shows the upload CTA in idle state", () => {
    render(<DesignSystemBanner roomId="room-1" />);
    expect(screen.getByText(/upload design system/i)).toBeInTheDocument();
  });

  it("dismissing hides the banner for this render", () => {
    render(<DesignSystemBanner roomId="room-1" />);
    fireEvent.click(screen.getByRole("button", { name: /dismiss/i }));
    expect(screen.queryByText(/upload design system/i)).not.toBeInTheDocument();
  });

  it("shows a distilling status with a spinner", () => {
    hookState.status = "distilling";
    render(<DesignSystemBanner roomId="room-1" />);
    expect(screen.getByText(/distilling your design system/i)).toBeInTheDocument();
    hookState.status = "idle";
  });

  it("shows the failure message and an idle retry CTA", () => {
    hookState.status = "failed";
    hookState.message = "That file has no readable text.";
    render(<DesignSystemBanner roomId="room-1" />);
    expect(screen.getByText("That file has no readable text.")).toBeInTheDocument();
    expect(screen.getByText(/upload design system/i)).toBeInTheDocument();
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
