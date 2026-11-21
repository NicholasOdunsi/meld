// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { ColourField } from "./colour-field";
afterEach(cleanup);
function open(props: Partial<Parameters<typeof ColourField>[0]> = {}) {
  const onChange = vi.fn();
  render(<ColourField label="Background colour" value="#123456" used={[]} onChange={onChange} {...props} />);
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
