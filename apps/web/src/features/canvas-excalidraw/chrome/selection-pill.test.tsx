// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionPill } from "./selection-pill";

const view = { scrollX: 0, scrollY: 0, zoom: 1 };
const swatches = [{ label: "Ink", color: "#111111" }, { label: "Accent", color: "#00e1f3" }];
const base = { view, swatches, onStroke: vi.fn(), onStrokeWidth: vi.fn(), onFontSize: vi.fn() };

afterEach(cleanup);

describe("SelectionPill", () => {
  it("offers colour and stroke for shapes", async () => {
    const onStroke = vi.fn();
    const onStrokeWidth = vi.fn();
    render(<SelectionPill {...base} onStroke={onStroke} onStrokeWidth={onStrokeWidth}
      selection={{ kind: "shape", ids: ["r"], screenId: null, bounds: { x: 0, y: 0, width: 100, height: 50 } }} />);
    await userEvent.click(screen.getByRole("button", { name: "Accent" }));
    expect(onStroke).toHaveBeenCalledWith("#00e1f3");
    await userEvent.click(screen.getByRole("button", { name: "Bold" }));
    expect(onStrokeWidth).toHaveBeenCalledWith(4);
    expect(screen.queryByRole("button", { name: "L" })).toBeNull();
  });
  it("offers text sizes for text", async () => {
    const onFontSize = vi.fn();
    render(<SelectionPill {...base} onFontSize={onFontSize}
      selection={{ kind: "text", ids: ["t"], screenId: null, bounds: { x: 0, y: 0, width: 40, height: 10 } }} />);
    await userEvent.click(screen.getByRole("button", { name: "Large text" }));
    expect(onFontSize).toHaveBeenCalledWith(28);
  });
  it("shows only screen actions for screens and hides when there are none", async () => {
    const open = vi.fn();
    const { rerender } = render(<SelectionPill {...base} screenActions={[{ label: "Open live", onPress: open }]}
      selection={{ kind: "screen", ids: ["s"], screenId: "ds-a", bounds: { x: 0, y: 0, width: 390, height: 844 } }} />);
    await userEvent.click(screen.getByRole("button", { name: "Open live" }));
    expect(open).toHaveBeenCalled();
    expect(screen.queryByRole("button", { name: "Accent" })).toBeNull();
    rerender(<SelectionPill {...base} selection={{ kind: "screen", ids: ["s"], screenId: "ds-a", bounds: { x: 0, y: 0, width: 1, height: 1 } }} />);
    expect(screen.queryByTestId("selection-pill")).toBeNull();
  });
});
