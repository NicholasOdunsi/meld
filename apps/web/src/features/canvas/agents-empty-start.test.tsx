// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AgentsEmptyStart } from "./agents-empty-start";

afterEach(cleanup);

describe("AgentsEmptyStart", () => {
  it("renders the three short starter rows", () => {
    render(<AgentsEmptyStart onPrefill={vi.fn()} onAddDesignSystem={vi.fn()} />);
    expect(screen.getByText("Add a design system")).toBeInTheDocument();
    expect(screen.getByText("Create a prototype")).toBeInTheDocument();
    expect(screen.getByText("Sketch a screen")).toBeInTheDocument();
  });

  it("opens the design-system upload from the first row, not a prefill", () => {
    const onPrefill = vi.fn();
    const onAddDesignSystem = vi.fn();
    render(
      <AgentsEmptyStart onPrefill={onPrefill} onAddDesignSystem={onAddDesignSystem} />,
    );
    fireEvent.click(screen.getByText("Add a design system"));
    expect(onAddDesignSystem).toHaveBeenCalledTimes(1);
    expect(onPrefill).not.toHaveBeenCalled();
  });

  it("prefills the composer with a screen instruction from the prototype row", () => {
    const onPrefill = vi.fn();
    render(<AgentsEmptyStart onPrefill={onPrefill} onAddDesignSystem={vi.fn()} />);
    fireEvent.click(screen.getByText("Create a prototype"));
    expect(onPrefill).toHaveBeenCalledWith("Create a screen for ");
  });

  it("prefills a sketch-to-build instruction from the sketch row", () => {
    const onPrefill = vi.fn();
    render(<AgentsEmptyStart onPrefill={onPrefill} onAddDesignSystem={vi.fn()} />);
    fireEvent.click(screen.getByText("Sketch a screen"));
    expect(onPrefill).toHaveBeenCalledWith("Build a screen from my sketch: ");
  });
});
