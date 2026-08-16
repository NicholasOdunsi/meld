// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const upload = vi.hoisted(() => ({
  isBusy: false,
  openPicker: vi.fn(),
  onInputChange: vi.fn(),
  inputRef: { current: null },
  status: "idle" as string,
  message: null as string | null,
}));

vi.mock("@/features/design/use-design-system-upload", () => ({
  DESIGN_SYSTEM_ACCEPT: ".md",
  useDesignSystemUpload: () => upload,
}));

import { CanvasAgentSidebar } from "./canvas-rail";

afterEach(cleanup);
beforeEach(() => {
  upload.isBusy = false;
  upload.openPicker.mockClear();
});

describe("CanvasAgentSidebar header design-system upload", () => {
  it("opens the design-system picker from the header palette button", () => {
    render(
      <CanvasAgentSidebar isOpen onToggle={vi.fn()} roomId="room-1">
        <p>panel</p>
      </CanvasAgentSidebar>,
    );
    const button = screen.getByRole("button", { name: "Upload design system" });
    expect(button).toBeInTheDocument();
    fireEvent.click(button);
    expect(upload.openPicker).toHaveBeenCalledTimes(1);
  });

  it("swaps the palette button for a spinner while a design system is distilling", () => {
    upload.isBusy = true;
    render(
      <CanvasAgentSidebar isOpen onToggle={vi.fn()} roomId="room-1">
        <p>panel</p>
      </CanvasAgentSidebar>,
    );
    expect(
      screen.queryByRole("button", { name: "Upload design system" }),
    ).not.toBeInTheDocument();
    expect(screen.getByLabelText("Distilling design system")).toBeInTheDocument();
  });

  it("does not render the header upload control while collapsed", () => {
    render(<CanvasAgentSidebar isOpen={false} onToggle={vi.fn()} roomId="room-1" />);
    expect(
      screen.queryByRole("button", { name: "Upload design system" }),
    ).not.toBeInTheDocument();
    expect(screen.getByTestId("canvas-rail-agents")).toBeInTheDocument();
  });
});
