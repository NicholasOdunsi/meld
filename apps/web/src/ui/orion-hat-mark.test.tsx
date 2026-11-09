// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { OrionHatMark } from "./orion-hat-mark";

afterEach(cleanup);

describe("OrionHatMark", () => {
  it("working uses the neutral face and the sway", () => {
    render(<OrionHatMark state="working" color="var(--color-icon-blue)" hop={false} label="Orion: working" />);
    const hat = screen.getByRole("img", { name: "Orion: working" });
    expect(hat).toHaveAttribute("data-expression", "neutral");
    expect(hat).toHaveAttribute("data-hat-state", "working");
    expect(hat).not.toHaveAttribute("data-hop");
  });
  it("needs-you uses the curious face and hops only when asked", () => {
    const { rerender } = render(<OrionHatMark state="needs_you" color="var(--color-icon-orange)" hop label="Mark needs you" />);
    expect(screen.getByRole("img")).toHaveAttribute("data-expression", "curious");
    expect(screen.getByRole("img")).toHaveAttribute("data-hop", "true");
    rerender(<OrionHatMark state="needs_you" color="var(--color-icon-orange)" hop={false} label="Mark needs you" />);
    expect(screen.getByRole("img")).not.toHaveAttribute("data-hop");
  });
  it("tints with the project colour", () => {
    const { container } = render(<OrionHatMark state="working" color="var(--color-icon-teal)" hop={false} label="Mail: working" />);
    expect(container.querySelector('[data-part="tint"] rect')).toHaveAttribute("fill", "var(--color-icon-teal)");
  });
});
