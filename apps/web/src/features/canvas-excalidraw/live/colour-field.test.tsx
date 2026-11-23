// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ColourRow } from "./inspector-ui";
import { INSPECTOR_CSS } from "./inspector-theme";
afterEach(cleanup);
function open(props: Partial<Parameters<typeof ColourRow>[0]> = {}) {
  const onChange = vi.fn();
  render(<ColourRow ariaLabel="Background colour" value="#123456" used={[]} onChange={onChange} {...props} />);
  fireEvent.click(screen.getByRole("button", { name: "Background colour" }));
  return onChange;
}
it("opens a palette and reports a clicked swatch", () => {
  const onChange = open();
  fireEvent.click(screen.getByRole("button", { name: "#ef4444" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("#ef4444");
});
it("rejects a bad hex with a message and accepts a good one", () => {
  const onChange = open({ value: "#654321" });
  const hex = screen.getByRole("textbox", { name: "Hex" });
  fireEvent.change(hex, { target: { value: "#12345" } });
  fireEvent.keyDown(hex, { key: "Enter" });
  expect(screen.getByText("Use a colour like #1A2B3C.")).toBeInTheDocument();
  expect(onChange).not.toHaveBeenCalled();
  fireEvent.change(hex, { target: { value: "#123456" } });
  fireEvent.keyDown(hex, { key: "Enter" });
  expect(onChange).toHaveBeenCalledExactlyOnceWith("#123456");
});
it("lists colours used on the screen", () => {
  const onChange = open({ used: ["#abcdef"] });
  expect(screen.getByText("Used on this screen")).toBeInTheDocument();
  fireEvent.click(screen.getByRole("button", { name: "#abcdef" }));
  expect(onChange).toHaveBeenCalledExactlyOnceWith("#abcdef");
});
it("offers None only when it can clear", () => {
  const onClear = vi.fn();
  open({ onClear });
  fireEvent.click(screen.getByRole("button", { name: "None" }));
  expect(onClear).toHaveBeenCalledOnce();
  cleanup();
  open();
  expect(screen.queryByRole("button", { name: "None" })).toBeNull();
});
it("does not write a no-op edit when the Hex box is untouched", () => {
  const onChange = open({ value: "#FF0000" });
  const hex = screen.getByRole("textbox", { name: "Hex" });
  fireEvent.focus(hex);
  fireEvent.blur(hex);
  fireEvent.keyDown(hex, { key: "Enter" });
  expect(onChange).not.toHaveBeenCalled();
});
it("keeps the swatches as one tab stop that follows the arrow keys", () => {
  open({ value: "#FFFFFF" });
  const stops = () =>
    screen.getAllByRole("button", { name: /^#[0-9a-f]{6}$/ }).filter((b) => b.tabIndex === 0);
  expect(stops()).toHaveLength(1);
  const first = screen.getByRole("button", { name: "#ffffff" });
  expect(first.tabIndex).toBe(0);
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  const second = screen.getByRole("button", { name: "#f5f5f5" });
  expect(second).toHaveFocus();
  expect(stops()).toEqual([second]);
  fireEvent.keyDown(second, { key: "ArrowLeft" });
  expect(first).toHaveFocus();
});
it("starts the tab stop on the current colour, or the first swatch when none", () => {
  open({ value: "#ef4444" });
  expect(screen.getByRole("button", { name: "#ef4444" }).tabIndex).toBe(0);
  expect(screen.getByRole("button", { name: "#ffffff" }).tabIndex).toBe(-1);
  cleanup();
  open({ value: null });
  expect(screen.getByRole("button", { name: "#ffffff" }).tabIndex).toBe(0);
});
it("moves up and down by row, clamping to the shorter row", () => {
  open();
  const grey = screen.getByRole("button", { name: "#404040" }); // row 0, column 5
  grey.focus();
  fireEvent.keyDown(grey, { key: "ArrowDown" });
  expect(screen.getByRole("button", { name: "#b91c1c" })).toHaveFocus(); // red row has 5, column 5 clamps to 4
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowUp" });
  expect(screen.getByRole("button", { name: "#737373" })).toHaveFocus(); // column 4 of the grey row
});
it("draws swatches through the board's dark canvas filter only when asked", () => {
  open({ value: "#1e1e1e", canvasFilter: true });
  // A popup swatch is a button whose dot is drawn by a pseudo-element, so the hover ring is never filtered.
  const swatches = Array.from(document.querySelectorAll<HTMLElement>(".orion-i-pop button[data-swatch]"));
  expect(swatches.length).toBeGreaterThan(10);
  for (const swatch of swatches) expect(swatch.style.getPropertyValue("--orion-i-pop-filter")).toBe("invert(93%) hue-rotate(180deg)");
  cleanup();
  open({ value: "#1e1e1e" });
  for (const swatch of document.querySelectorAll<HTMLElement>(".orion-i-pop button[data-swatch]")) expect(swatch.style.getPropertyValue("--orion-i-pop-filter")).toBe("none");
});
it("names the trigger by its label and describes the current colour", () => {
  render(<ColourRow ariaLabel="Background colour" value="#123456" used={[]} onChange={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Background colour" })).toHaveAccessibleDescription("123456");
  cleanup();
  render(<ColourRow ariaLabel="Fill" value={null} used={[]} onChange={vi.fn()} onClear={vi.fn()} />);
  expect(screen.getByRole("button", { name: "Fill" })).toHaveAccessibleDescription("None");
});
it("styles the popup like the pill: the popover surface class, swatches as native buttons, a Hex box in the field look", () => {
  open({ onClear: vi.fn() });
  const pop = document.querySelector(".orion-i-pop");
  expect(pop).not.toBeNull();
  expect(pop).toContainElement(screen.getByRole("textbox", { name: "Hex" }));
  expect(screen.getByRole("textbox", { name: "Hex" })).toHaveClass("orion-i-hex");
  expect(screen.getByRole("button", { name: "#ef4444" }).tagName).toBe("BUTTON");
  expect(screen.getByRole("button", { name: "None" })).toBeInTheDocument();
  // The sheet gives the popover the pill's surface, border and shadow (as variables, 18px swatches, a hover ring).
  expect(INSPECTOR_CSS).toMatch(/\.astryx-popover:has\(\.orion-i-pop\)\{[^}]*background:var\(--orion-i-surface\)[^}]*border:var\(--orion-i-border\)[^}]*box-shadow:var\(--orion-i-shadow\)/);
  expect(INSPECTOR_CSS).toMatch(/\.orion-i-pop__sw:hover[^{]*\{[^}]*box-shadow:var\(--orion-i-pop-ring\)/);
});
it("ties the Hex box to its error message while the error shows", () => {
  open({ value: "#654321" });
  const hex = screen.getByRole("textbox", { name: "Hex" });
  expect(hex).not.toHaveAttribute("aria-describedby");
  fireEvent.change(hex, { target: { value: "#12345" } });
  fireEvent.keyDown(hex, { key: "Enter" });
  const alert = screen.getByRole("alert");
  expect(alert).toHaveTextContent("Use a colour like #1A2B3C.");
  expect(alert.id).not.toBe("");
  expect(hex).toHaveAttribute("aria-describedby", alert.id);
  fireEvent.change(hex, { target: { value: "#123456" } });
  expect(hex).not.toHaveAttribute("aria-describedby");
});
it("keeps the popup open when focus moves from the hex box to a swatch inside it", () => {
  const onChange = open({ value: "#654321" });
  const hex = screen.getByRole("textbox", { name: "Hex" });
  fireEvent.change(hex, { target: { value: "#123456" } });
  const swatch = screen.getByRole("button", { name: "#ef4444" });
  fireEvent.blur(hex, { relatedTarget: swatch });
  expect(onChange).not.toHaveBeenCalled();
  expect(screen.getByRole("button", { name: "Background colour" })).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(hex, { key: "Enter" });
  expect(onChange).toHaveBeenCalledExactlyOnceWith("#123456");
});
it("still commits a typed hex when focus leaves the popup", () => {
  const onChange = open({ value: "#654321" });
  const hex = screen.getByRole("textbox", { name: "Hex" });
  fireEvent.change(hex, { target: { value: "#123456" } });
  fireEvent.blur(hex, { relatedTarget: document.body });
  expect(onChange).toHaveBeenCalledExactlyOnceWith("#123456");
});
it("reopens on a trigger click straight after Escape closed it", () => {
  open();
  const trigger = screen.getByRole("button", { name: "Background colour" });
  expect(trigger).toHaveAttribute("aria-expanded", "true");
  fireEvent.keyDown(screen.getByRole("textbox", { name: "Hex" }), { key: "Escape" });
  expect(trigger).toHaveAttribute("aria-expanded", "false");
  fireEvent.click(trigger);
  expect(trigger).toHaveAttribute("aria-expanded", "true");
});
