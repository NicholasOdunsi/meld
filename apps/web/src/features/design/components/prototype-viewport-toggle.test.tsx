// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MOBILE_VIEWPORT_WIDTH_PX,
  PrototypeViewportToggle,
} from "./prototype-viewport-toggle";

afterEach(cleanup);

describe("PrototypeViewportToggle", () => {
  it("marks the active viewport as pressed", () => {
    render(<PrototypeViewportToggle value="desktop" onChange={vi.fn()} />);
    expect(screen.getByRole("button", { name: /desktop/i })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByRole("button", { name: /mobile/i })).toHaveAttribute(
      "aria-pressed",
      "false",
    );
  });

  it("reports the viewport you pick", () => {
    const onChange = vi.fn();
    render(<PrototypeViewportToggle value="desktop" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /mobile/i }));
    expect(onChange).toHaveBeenCalledWith("mobile");
  });

  it("does not report a change when you pick what is already active", () => {
    const onChange = vi.fn();
    render(<PrototypeViewportToggle value="mobile" onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: /mobile/i }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it("pins the phone width the pane will use", () => {
    expect(MOBILE_VIEWPORT_WIDTH_PX).toBe(390);
  });
});
