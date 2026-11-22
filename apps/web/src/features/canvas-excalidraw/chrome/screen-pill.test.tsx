// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { hostPillItems, ScreenPill, type PillItem } from "./screen-pill";
import { screenPillItems } from "../live/live-actions";

const bounds = { x: 100, y: 50, width: 200, height: 300 };
const view = { scrollX: 0, scrollY: 0, zoom: 1 };
const button = (label: string, extra: Partial<Extract<PillItem, { kind: "button" }>> = {}): PillItem => ({ kind: "button", label, icon: <svg data-icon={label} />, onPress: vi.fn(), ...extra });
const names = () => within(screen.getByTestId("selection-pill")).getAllByRole("button").map((b) => b.getAttribute("aria-label"));

afterEach(cleanup);

describe("ScreenPill", () => {
  it("renders the buttons in order with accessible names, tooltips and dividers", () => {
    render(<ScreenPill bounds={bounds} view={view} items={[button("Edit"), { kind: "divider" }, button("Undo"), button("Redo"), { kind: "divider" }, button("Code", { tooltip: "Show the code" })]} />);
    expect(names()).toEqual(["Edit", "Undo", "Redo", "Code"]);
    expect(screen.getAllByRole("separator")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("title", "Edit");
    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("title", "Show the code");
  });

  it("sets aria-pressed only on a toggle, and a press calls back", async () => {
    const onPress = vi.fn();
    const { rerender } = render(<ScreenPill bounds={bounds} view={view} items={[button("Edit", { pressed: true, onPress }), button("Code")]} />);
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Code" })).not.toHaveAttribute("aria-pressed");
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onPress).toHaveBeenCalledOnce();
    rerender(<ScreenPill bounds={bounds} view={view} items={[button("Edit", { pressed: false, onPress })]} />);
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "false");
  });

  it("a disabled button says so with aria-disabled and ignores clicks", async () => {
    const onPress = vi.fn();
    render(<ScreenPill bounds={bounds} view={view} items={[button("Undo", { disabled: true, onPress }), button("Redo", { onPress })]} />);
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Redo" })).not.toHaveAttribute("aria-disabled");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("sits centred under the frame with the gap, and follows scroll and zoom", () => {
    const { rerender } = render(<ScreenPill bounds={bounds} view={view} items={[button("Code")]} />);
    const pill = () => screen.getByTestId("selection-pill");
    // Centre x = 200, bottom y = 350.
    expect(pill().style.transform).toContain("200px");
    expect(pill().style.transform).toContain("350px");
    expect(pill().style.transform).toContain("var(--orion-i-pill-offset)");
    expect(pill().style.transform).toContain("- 50%");
    rerender(<ScreenPill bounds={bounds} view={{ scrollX: 10, scrollY: -20, zoom: 2 }} items={[button("Code")]} />);
    expect(pill().style.transform).toContain("420px");
    expect(pill().style.transform).toContain("660px");
  });

  it("renders nothing without items", () => {
    render(<ScreenPill bounds={bounds} view={view} items={[]} />);
    expect(screen.queryByTestId("selection-pill")).toBeNull();
  });

  it("a press on the pill does not reach the board", () => {
    const onBoardDown = vi.fn();
    render(<section onPointerDown={onBoardDown}><ScreenPill bounds={bounds} view={view} items={[button("Code")]} /></section>);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Code" }));
    expect(onBoardDown).not.toHaveBeenCalled();
  });

  it("shows a host action by its label, and its pressed state", async () => {
    const onPress = vi.fn();
    render(<ScreenPill bounds={bounds} view={view} items={hostPillItems([{ label: "Add to chat", onPress }, { label: "Pin", onPress: vi.fn(), pressed: false }])} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to chat" }));
    expect(onPress).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Add to chat" })).toHaveTextContent("Add to chat");
    expect(screen.getByRole("button", { name: "Pin" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("screenPillItems", () => {
  const handlers = { onOpenLive: vi.fn(), onCode: vi.fn() };
  const history = { canUndo: true, canRedo: false, onUndo: vi.fn(), onRedo: vi.fn() };
  const shape = (items: PillItem[]) => items.map((item) => item.kind === "divider" ? "|" : item.label);

  it("a sleeping screen: Open live and Code", () => {
    const items = screenPillItems({ awake: false, ...handlers });
    expect(shape(items)).toEqual(["Open live", "Code"]);
    (items[0] as { onPress: () => void }).onPress();
    (items[1] as { onPress: () => void }).onPress();
    expect(handlers.onOpenLive).toHaveBeenCalledOnce();
    expect(handlers.onCode).toHaveBeenCalledOnce();
  });
  it("a sleeping screen never offers Edit or history", () => {
    expect(shape(screenPillItems({ awake: false, edit: { pressed: false, onToggle: vi.fn() }, history, ...handlers }))).toEqual(["Open live", "Code"]);
  });
  it("an awake editable screen: Edit | Undo Redo | Code", () => {
    const onToggle = vi.fn();
    const items = screenPillItems({ awake: true, edit: { pressed: true, onToggle }, history, ...handlers });
    expect(shape(items)).toEqual(["Edit", "|", "Undo", "Redo", "|", "Code"]);
    expect(items[0]).toMatchObject({ pressed: true });
    expect(items[2]).toMatchObject({ disabled: false });
    expect(items[3]).toMatchObject({ disabled: true });
    expect(items.filter((i) => i.kind === "button" && i.label !== "Edit").every((i) => i.kind === "button" && i.pressed === undefined)).toBe(true);
    (items[0] as { onPress: () => void }).onPress();
    expect(onToggle).toHaveBeenCalledOnce();
  });
  it("an awake read-only screen: only Code, with no dangling divider", () => {
    expect(shape(screenPillItems({ awake: true, ...handlers }))).toEqual(["Code"]);
  });
  it("Undo and Redo only appear with history", () => {
    expect(shape(screenPillItems({ awake: true, edit: { pressed: false, onToggle: vi.fn() }, ...handlers }))).toEqual(["Edit", "|", "Code"]);
  });
});
