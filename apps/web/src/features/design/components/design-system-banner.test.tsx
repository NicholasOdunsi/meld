// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
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
});
