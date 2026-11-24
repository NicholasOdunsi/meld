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
    render(<ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={view} items={[button("Edit"), { kind: "divider" }, button("Undo"), button("Redo"), { kind: "divider" }, button("Code", { tooltip: "Show the code" })]} />);
    expect(names()).toEqual(["Edit", "Undo", "Redo", "Code"]);
    expect(screen.getAllByRole("separator")).toHaveLength(2);
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("title", "Edit");
    expect(screen.getByRole("button", { name: "Code" })).toHaveAttribute("title", "Show the code");
  });

  it("sets aria-pressed only on a toggle, and a press calls back", async () => {
    const onPress = vi.fn();
    const { rerender } = render(<ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={view} items={[button("Edit", { pressed: true, onPress }), button("Code")]} />);
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Code" })).not.toHaveAttribute("aria-pressed");
    await userEvent.click(screen.getByRole("button", { name: "Edit" }));
    expect(onPress).toHaveBeenCalledOnce();
    rerender(<ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={view} items={[button("Edit", { pressed: false, onPress })]} />);
    expect(screen.getByRole("button", { name: "Edit" })).toHaveAttribute("aria-pressed", "false");
  });

  it("a disabled button says so with aria-disabled and ignores clicks", async () => {
    const onPress = vi.fn();
    render(<ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={view} items={[button("Undo", { disabled: true, onPress }), button("Redo", { onPress })]} />);
    expect(screen.getByRole("button", { name: "Undo" })).toHaveAttribute("aria-disabled", "true");
    expect(screen.getByRole("button", { name: "Redo" })).not.toHaveAttribute("aria-disabled");
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onPress).not.toHaveBeenCalled();
  });

  it("sits centred under the frame with the gap, and follows scroll and zoom", () => {
    const { rerender } = render(<ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={view} items={[button("Code")]} />);
    const pill = () => screen.getByTestId("selection-pill");
    // Centre x = 200, bottom y = 350.
    expect(pill().style.transform).toContain("200px");
    // The gap (12) sits below the frame's bottom.
    expect(pill().style.transform).toContain("362px");
    expect(pill().style.transform).toContain("- 50%");
    rerender(<ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={{ scrollX: 10, scrollY: -20, zoom: 2 }} items={[button("Code")]} />);
    expect(pill().style.transform).toContain("420px");
    expect(pill().style.transform).toContain("672px");
  });

  it("is a labelled group (not a toolbar) with the caller's name, and the test id only when given", () => {
    const { rerender } = render(<ScreenPill label="Selected screen actions" bounds={bounds} view={view} items={[button("Code")]} />);
    expect(screen.getByRole("group", { name: "Selected screen actions" })).toBeInTheDocument();
    expect(screen.queryByRole("toolbar")).toBeNull();
    expect(screen.queryByTestId("selection-pill")).toBeNull();
    rerender(<ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={view} items={[button("Code")]} />);
    expect(screen.getByTestId("selection-pill")).toBe(screen.getByRole("group", { name: "Screen actions" }));
  });

  it("stays inside the visible board: pinned above the bottom edge when the frame runs off it", () => {
    const tall = { x: 100, y: 50, width: 200, height: 3000 };
    render(<ScreenPill label="Screen actions" testId="selection-pill" bounds={tall} view={{ ...view, width: 1000, height: 800 }} items={[button("Code")]} />);
    // Unmeasured (0x0 in jsdom): y = 800 - bottom inset.
    expect(screen.getByTestId("selection-pill").style.transform).toContain("740px");
  });

  it("renders nothing, not even in the tab order, while the frame is out of view", () => {
    render(<ScreenPill label="Screen actions" testId="selection-pill" bounds={{ x: 5000, y: 0, width: 200, height: 300 }} view={{ ...view, width: 1000, height: 800 }} items={[button("Code")]} />);
    expect(screen.queryByTestId("selection-pill")).toBeNull();
    expect(screen.queryByRole("button", { name: "Code" })).toBeNull();
  });

  it("renders nothing without items", () => {
    render(<ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={view} items={[]} />);
    expect(screen.queryByTestId("selection-pill")).toBeNull();
  });

  it("a press on the pill does not reach the board", () => {
    const onBoardDown = vi.fn();
    render(<section onPointerDown={onBoardDown}><ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={view} items={[button("Code")]} /></section>);
    fireEvent.pointerDown(screen.getByRole("button", { name: "Code" }));
    expect(onBoardDown).not.toHaveBeenCalled();
  });

  it("a mouse press on a button does not take focus from the field that has it", async () => {
    render(<><input aria-label="Width" /><ScreenPill label="Screen actions" bounds={bounds} view={view} items={[button("Undo"), button("Code")]} /></>);
    screen.getByRole("textbox", { name: "Width" }).focus();
    await userEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(document.activeElement).toBe(screen.getByRole("textbox", { name: "Width" }));
    // The keyboard still works.
    const onPress = vi.fn();
    cleanup();
    render(<ScreenPill label="Screen actions" bounds={bounds} view={view} items={[button("Code", { onPress })]} />);
    screen.getByRole("button", { name: "Code" }).focus();
    await userEvent.keyboard("{Enter}");
    expect(onPress).toHaveBeenCalledOnce();
  });

  it("keeps the browser from zooming on ctrl+wheel over the pill, but lets a plain wheel through", () => {
    render(<ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={view} items={[button("Code")]} />);
    const pill = screen.getByTestId("selection-pill");
    const pinch = new WheelEvent("wheel", { ctrlKey: true, cancelable: true, bubbles: true });
    pill.dispatchEvent(pinch);
    expect(pinch.defaultPrevented).toBe(true);
    const scroll = new WheelEvent("wheel", { cancelable: true, bubbles: true });
    pill.dispatchEvent(scroll);
    expect(scroll.defaultPrevented).toBe(false);
    const gesture = new Event("gesturestart", { cancelable: true, bubbles: true });
    pill.dispatchEvent(gesture);
    expect(gesture.defaultPrevented).toBe(true);
  });

  it("shows a host action by its label, and its pressed state", async () => {
    const onPress = vi.fn();
    render(<ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={view} items={hostPillItems([{ label: "Add to chat", onPress }, { label: "Pin", onPress: vi.fn(), pressed: false }])} />);
    await userEvent.click(screen.getByRole("button", { name: "Add to chat" }));
    expect(onPress).toHaveBeenCalledOnce();
    expect(screen.getByRole("button", { name: "Add to chat" })).toHaveTextContent("Add to chat");
    expect(screen.getByRole("button", { name: "Add to chat" })).toHaveClass("orion-pill__btn--text");
    expect(hostPillItems([{ label: "x", onPress }])[0]).toMatchObject({ text: true });
    expect(screen.getByRole("button", { name: "Pin" })).toHaveAttribute("aria-pressed", "false");
  });
});

describe("screenPillItems", () => {
  const handlers = { onCode: vi.fn() };
  const history = { canUndo: true, canRedo: false, onUndo: vi.fn(), onRedo: vi.fn() };
  const shape = (items: PillItem[]) => items.map((item) => item.kind === "divider" ? "|" : item.label);

  it("never offers Open live, whatever it is given", () => {
    const all = [
      screenPillItems({ ...handlers }),
      screenPillItems({ edit: { pressed: false, onToggle: vi.fn() }, ...handlers }),
      screenPillItems({ edit: { pressed: false, onToggle: vi.fn() }, history, ...handlers }),
    ];
    for (const items of all) expect(shape(items)).not.toContain("Open live");
  });
  it("an editable screen: Edit | Undo Redo | Code", () => {
    const onToggle = vi.fn();
    const items = screenPillItems({ edit: { pressed: true, onToggle }, history, ...handlers });
    expect(shape(items)).toEqual(["Edit", "|", "Undo", "Redo", "|", "Code"]);
    expect(items[0]).toMatchObject({ pressed: true });
    expect(items[2]).toMatchObject({ disabled: false });
    expect(items[3]).toMatchObject({ disabled: true });
    expect(items.filter((i) => i.kind === "button" && i.label !== "Edit").every((i) => i.kind === "button" && i.pressed === undefined)).toBe(true);
    (items[0] as { onPress: () => void }).onPress();
    expect(onToggle).toHaveBeenCalledOnce();
  });
  it("a read-only screen: only Code, with no dangling divider", () => {
    expect(shape(screenPillItems({ ...handlers }))).toEqual(["Code"]);
  });
  it("Undo and Redo only appear with history", () => {
    expect(shape(screenPillItems({ edit: { pressed: false, onToggle: vi.fn() }, ...handlers }))).toEqual(["Edit", "|", "Code"]);
  });
  it("Edit shows a pointer inside a square (pick an element), drawn like the other pill icons", () => {
    render(<ScreenPill label="Screen actions" testId="selection-pill" bounds={bounds} view={view} items={screenPillItems({ edit: { pressed: false, onToggle: vi.fn() }, history, ...handlers })} />);
    const svg = (name: string) => screen.getByRole("button", { name }).querySelector("svg")!;
    expect(svg("Edit")).toHaveClass("lucide-square-mouse-pointer");
    expect(svg("Edit")).not.toHaveClass("lucide-mouse-pointer-2");
    for (const name of ["Edit", "Undo", "Code"]) {
      expect(svg(name)).toHaveAttribute("width", "17");
      expect(svg(name)).toHaveAttribute("stroke-width", "1.75");
    }
  });
});
