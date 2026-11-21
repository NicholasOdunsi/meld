// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionPill } from "./selection-pill";

const view = { scrollX: 0, scrollY: 0, zoom: 1 };
const base = { view };

afterEach(cleanup);

describe("SelectionPill", () => {
  it("has no colour, thickness or size controls for shapes or text: those live in the panel", () => {
    for (const kind of ["shape", "text"] as const) {
      render(<SelectionPill {...base} selection={{ kind, ids: ["r"], screenId: null, bounds: { x: 0, y: 0, width: 100, height: 50 } }} />);
      expect(screen.queryByTestId("selection-pill")).toBeNull();
      cleanup();
    }
  });
  it("shows only the host's shape actions for a shape", async () => {
    const onPress = vi.fn();
    render(<SelectionPill {...base} shapeActions={[{ label: "Add to chat", onPress }]}
      selection={{ kind: "shape", ids: ["r"], screenId: null, bounds: { x: 0, y: 0, width: 100, height: 50 } }} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to chat" }));
    expect(onPress).toHaveBeenCalledOnce();
    for (const name of ["Thin", "Bold", "Small text", "Large text"]) expect(screen.queryByRole("button", { name })).toBeNull();
  });
  it("shows only screen actions for screens and hides when there are none", async () => {
    const open = vi.fn();
    const { rerender } = render(<SelectionPill {...base} screenActions={[{ label: "Open live", onPress: open }]}
      selection={{ kind: "screen", ids: ["s"], screenId: "ds-a", bounds: { x: 0, y: 0, width: 390, height: 844 } }} />);
    await userEvent.click(screen.getByRole("button", { name: "Open live" }));
    expect(open).toHaveBeenCalled();
    rerender(<SelectionPill {...base} selection={{ kind: "screen", ids: ["s"], screenId: "ds-a", bounds: { x: 0, y: 0, width: 1, height: 1 } }} />);
    expect(screen.queryByTestId("selection-pill")).toBeNull();
  });
  it("reflects a toggle action's pressed state with aria-pressed", async () => {
    const onPress = vi.fn();
    const selection = { kind: "screen" as const, ids: ["s"], screenId: "ds-a", bounds: { x: 0, y: 0, width: 390, height: 844 } };
    const { rerender } = render(<SelectionPill {...base} selection={selection} screenActions={[{ label: "Interact", onPress, pressed: true }, { label: "Code", onPress: vi.fn() }]} />);
    expect(screen.getByRole("button", { name: "Interact" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Code" })).not.toHaveAttribute("aria-pressed");
    await userEvent.click(screen.getByRole("button", { name: "Interact" }));
    expect(onPress).toHaveBeenCalledOnce();
    rerender(<SelectionPill {...base} selection={selection} screenActions={[{ label: "Interact", onPress, pressed: false }]} />);
    expect(screen.getByRole("button", { name: "Interact" })).toHaveAttribute("aria-pressed", "false");
  });
});
