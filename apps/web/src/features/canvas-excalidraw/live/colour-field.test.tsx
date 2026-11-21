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
it("moves focus between swatches with the arrow keys", () => {
  open();
  const first = screen.getByRole("button", { name: "#ffffff" });
  first.focus();
  fireEvent.keyDown(first, { key: "ArrowRight" });
  expect(screen.getByRole("button", { name: "#f5f5f5" })).toHaveFocus();
  fireEvent.keyDown(document.activeElement as HTMLElement, { key: "ArrowLeft" });
  expect(first).toHaveFocus();
});
