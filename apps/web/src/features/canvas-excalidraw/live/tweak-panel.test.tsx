// @vitest-environment jsdom
import { afterEach, expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import type { Field, FieldState } from "@meld/screen-runtime/edit/types";
import type { Computed } from "./live-messages";
import { TweakPanel, type TweakPanelProps } from "./tweak-panel";
afterEach(cleanup);

const FIELDS: readonly Field[] = [
  "text", "color", "backgroundColor", "fontSize", "fontWeight", "fontFamily",
  "padding", "gap", "borderRadius", "width", "height",
];
const COMPUTED: Computed = {
  fontFamily: 'ui-monospace, "SF Mono", monospace',
  fontSize: "16",
  fontWeight: "400",
  color: "rgb(17, 34, 51)",
  backgroundColor: "rgb(255, 0, 0)",
  width: "120",
  height: "40",
  padding: "8",
  gap: "4",
  borderRadius: "6",
  display: "block",
};
function fields(overrides: Partial<Record<Field, Partial<FieldState>>> = {}) {
  return Object.fromEntries(
    FIELDS.map((field) => [field, { editable: true, value: null, ...overrides[field] }]),
  ) as Record<Field, FieldState>;
}
function setup(props: Partial<TweakPanelProps> = {}) {
  const onTweak = vi.fn();
  const onAdd = vi.fn();
  render(
    <TweakPanel
      label="Action"
      fields={fields()}
      computed={COMPUTED}
      used={[]}
      onTweak={onTweak}
      onAdd={onAdd}
      canAdd
      {...props}
    />,
  );
  return { onTweak, onAdd };
}
// Number fields carry a visible " (px)" unit in their label.
const number = (name: string) => screen.getByRole("textbox", { name: new RegExp(`^${name}( \\(px\\))?$`) });
async function choose(selector: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: selector }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

it("renders a real control for every field and nothing from the old toolbar or class names", () => {
  setup({ fields: fields({ text: { value: "Buy now" }, backgroundColor: { value: "bg-red-500" } }) });
  expect(screen.getByRole("textbox", { name: "Text" })).toHaveValue("Buy now");
  expect(screen.getByRole("combobox", { name: "Font" })).toBeInTheDocument();
  expect(screen.getByRole("combobox", { name: "Weight" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Text colour" })).toBeInTheDocument();
  expect(screen.getByRole("button", { name: "Background colour" })).toBeInTheDocument();
  for (const name of ["Size", "Width", "Height", "Padding", "Corner radius"]) expect(number(name)).toBeInTheDocument();
  expect(screen.queryByRole("textbox", { name: /^Gap/ })).toBeNull(); // display:block hides gap
  for (const name of ["Pick", "Undo", "Redo"]) expect(screen.queryByRole("button", { name })).toBeNull();
  expect(screen.queryByText(/bg-red-500/)).toBeNull();
  expect(screen.queryByRole("textbox", { name: /bg-red-500/ })).toBeNull();
  expect(screen.getByText("Action")).toBeInTheDocument();
});

it("never shows a raw class name, even with no rendered values", () => {
  setup({ computed: null, fields: fields({ backgroundColor: { value: "bg-red-500" }, color: { value: "text-white" } }) });
  expect(document.body.innerHTML).not.toContain("bg-red-500");
  expect(document.body.innerHTML).not.toContain("text-white");
});

it("shows Gap for a flex container", () => {
  setup({ computed: { ...COMPUTED, display: "flex" } });
  expect(number("Gap")).toHaveValue("4");
});

it("shows the real rendered numbers, with an auto tag when the source states none", () => {
  setup({ fields: fields({ height: { value: "48" } }) });
  expect(number("Width")).toHaveValue("120");
  expect(number("Height")).toHaveValue("40");
  expect(screen.getAllByText("auto")).toHaveLength(1);
  expect(screen.getByText("Showing: SF Mono")).toBeInTheDocument();
});

it("commits font, weight and colour choices immediately", async () => {
  const { onTweak } = setup();
  await choose("Font", "Serif");
  expect(onTweak).toHaveBeenLastCalledWith({ field: "fontFamily", value: "serif" });
  await choose("Weight", "Bold");
  expect(onTweak).toHaveBeenLastCalledWith({ field: "fontWeight", value: "700" });
  fireEvent.click(screen.getByRole("button", { name: "Background colour" }));
  fireEvent.click(screen.getAllByRole("button", { name: /^#[0-9a-f]{6}$/i })[0]!);
  expect(onTweak).toHaveBeenLastCalledWith({
    field: "backgroundColor",
    value: expect.stringMatching(/^#[0-9a-f]{6}$/i),
  });
  expect(onTweak).toHaveBeenCalledTimes(3);
});

it("commits a number once on Enter or blur, never per keystroke", () => {
  const { onTweak } = setup();
  const padding = number("Padding");
  fireEvent.change(padding, { target: { value: "1" } });
  fireEvent.change(padding, { target: { value: "16" } });
  expect(onTweak).not.toHaveBeenCalled();
  fireEvent.keyDown(padding, { key: "Enter" });
  fireEvent.blur(padding);
  expect(onTweak).toHaveBeenCalledExactlyOnceWith({ field: "padding", value: "16" });
});

it("keeps a bad number local and explains it", () => {
  const { onTweak } = setup();
  const padding = number("Padding");
  fireEvent.change(padding, { target: { value: "abc" } });
  fireEvent.blur(padding);
  expect(screen.getByText("Use a whole number, like 8.")).toBeInTheDocument();
  fireEvent.change(padding, { target: { value: "-2" } });
  fireEvent.blur(padding);
  expect(screen.getByText("Use a whole number, like 8.")).toBeInTheDocument();
  expect(onTweak).not.toHaveBeenCalled();
  // Decimals are not whole numbers: the copy says so, and nothing is applied.
  fireEvent.change(padding, { target: { value: "2.5" } });
  fireEvent.blur(padding);
  expect(screen.getByText("Use a whole number, like 8.")).toBeInTheDocument();
  expect(onTweak).not.toHaveBeenCalled();
  fireEvent.change(padding, { target: { value: "3px" } });
  fireEvent.blur(padding);
  expect(onTweak).toHaveBeenCalledExactlyOnceWith({ field: "padding", value: "3" });
});

it("steps from a fractional rendered value to a whole number", () => {
  const { onTweak } = setup({ computed: { ...COMPUTED, width: "120.4" } });
  fireEvent.keyDown(number("Width"), { key: "ArrowUp" });
  expect(onTweak).toHaveBeenCalledExactlyOnceWith({ field: "width", value: "121" });
});

it("keeps the same input, and its focus, through a refresh after each step", () => {
  const onTweak = vi.fn();
  const props: TweakPanelProps = {
    label: "Action", fields: fields({ fontSize: { value: "16" } }), computed: { ...COMPUTED, fontSize: "16" }, used: [], onTweak, onAdd: vi.fn(), canAdd: true,
  };
  const { rerender } = render(<TweakPanel {...props} />);
  const size = number("Size");
  size.focus();
  fireEvent.keyDown(size, { key: "ArrowUp" });
  expect(onTweak).toHaveBeenLastCalledWith({ field: "fontSize", value: "17" });
  // The change is applied: the panel is pending, then the element is read again (its label changes too).
  rerender(<TweakPanel {...props} isPending />);
  expect(number("Size")).toBe(size);
  expect(document.activeElement).toBe(size);
  // A step while pending does nothing (no double apply from a stale value).
  fireEvent.keyDown(size, { key: "ArrowUp" });
  expect(onTweak).toHaveBeenCalledTimes(1);
  rerender(<TweakPanel {...props} label="Action!" fields={fields({ fontSize: { value: "17" } })} computed={{ ...COMPUTED, fontSize: "17" }} />);
  expect(number("Size")).toBe(size);
  expect(document.activeElement).toBe(size);
  expect(size).toHaveValue("17");
  fireEvent.keyDown(size, { key: "ArrowUp" });
  expect(onTweak).toHaveBeenLastCalledWith({ field: "fontSize", value: "18" });
  expect(onTweak).toHaveBeenCalledTimes(2);
});

it("ignores colour and dropdown changes while pending, and dims the body", async () => {
  const { onTweak } = setup({ isPending: true });
  expect(document.querySelector("[aria-busy=true]")).not.toBeNull();
  await choose("Weight", "Bold");
  expect(onTweak).not.toHaveBeenCalled();
});

it("steps a number with the arrow keys and commits each step once", () => {
  const { onTweak } = setup({ fields: fields({ fontSize: { value: "16" } }), computed: { ...COMPUTED, fontSize: "16" } });
  const size = number("Size");
  fireEvent.keyDown(size, { key: "ArrowUp" });
  expect(onTweak).toHaveBeenCalledExactlyOnceWith({ field: "fontSize", value: "17" });
  expect(size).toHaveValue("17");
  fireEvent.blur(size);
  expect(onTweak).toHaveBeenCalledTimes(1);
  fireEvent.keyDown(size, { key: "ArrowDown" });
  expect(onTweak).toHaveBeenLastCalledWith({ field: "fontSize", value: "16" });
});

it("never steps below zero", () => {
  const { onTweak } = setup({ computed: { ...COMPUTED, padding: "0" } });
  const padding = number("Padding");
  fireEvent.keyDown(padding, { key: "ArrowDown" });
  expect(padding).toHaveValue("0");
  expect(onTweak).not.toHaveBeenCalled();
});

it("accepts a pasted px unit", () => {
  const { onTweak } = setup();
  const padding = number("Padding");
  fireEvent.change(padding, { target: { value: "16px" } });
  fireEvent.keyDown(padding, { key: "Enter" });
  expect(onTweak).toHaveBeenCalledExactlyOnceWith({ field: "padding", value: "16" });
});

it("resets an edited box to the new real value but leaves untouched siblings alone", () => {
  const props: TweakPanelProps = {
    label: "Action", fields: fields(), computed: COMPUTED, used: [], onTweak: vi.fn(), onAdd: vi.fn(), canAdd: true,
  };
  const { rerender } = render(<TweakPanel {...props} />);
  fireEvent.change(number("Padding"), { target: { value: "16" } });
  fireEvent.keyDown(number("Padding"), { key: "Enter" });
  fireEvent.change(number("Width"), { target: { value: "999" } }); // typed, not committed
  rerender(<TweakPanel {...props} computed={{ ...COMPUTED, padding: "16" }} />);
  expect(number("Padding")).toHaveValue("16");
  expect(number("Width")).toHaveValue("999");
  rerender(<TweakPanel {...props} computed={{ ...COMPUTED, padding: "20" }} />);
  expect(number("Padding")).toHaveValue("20");
  expect(number("Width")).toHaveValue("999");
});

it("commits edited text on Enter", () => {
  const { onTweak } = setup({ fields: fields({ text: { value: "Buy" } }) });
  const text = screen.getByRole("textbox", { name: "Text" });
  fireEvent.change(text, { target: { value: "Buy now" } });
  fireEvent.keyDown(text, { key: "Enter" });
  expect(onTweak).toHaveBeenCalledExactlyOnceWith({ field: "text", value: "Buy now" });
});

it("disables code-owned fields once with a note", () => {
  setup({ fields: fields({ padding: { editable: false }, color: { editable: false } }) });
  expect(number("Padding")).toHaveAttribute("disabled");
  expect(screen.getByRole("button", { name: "Text colour" })).toBeDisabled();
  expect(screen.getAllByText("Set by the screen's code. Change it in Code.")).toHaveLength(2); // Typography + Layout sections
});

it("offers Add to chat only when it can, else the reason", () => {
  const { onAdd } = setup();
  fireEvent.click(screen.getByRole("button", { name: "Add to chat" }));
  expect(onAdd).toHaveBeenCalledOnce();
  cleanup();
  setup({ canAdd: false, addReason: "Save this screen first." });
  expect(screen.queryByRole("button", { name: "Add to chat" })).toBeNull();
  expect(screen.getByText("Save this screen first.")).toBeInTheDocument();
});

it("shows a normalised value after a px commit and keeps following the value (Undo)", () => {
  const props: TweakPanelProps = {
    label: "Action", fields: fields(), computed: COMPUTED, used: [], onTweak: vi.fn(), onAdd: vi.fn(), canAdd: true,
  };
  const { rerender } = render(<TweakPanel {...props} />);
  fireEvent.change(number("Padding"), { target: { value: "9px" } });
  fireEvent.keyDown(number("Padding"), { key: "Enter" });
  expect(number("Padding")).toHaveValue("9");
  rerender(<TweakPanel {...props} computed={{ ...COMPUTED, padding: "9" }} />);
  rerender(<TweakPanel {...props} computed={{ ...COMPUTED, padding: "8" }} />);
  expect(number("Padding")).toHaveValue("8");
});

it("drops an invalid number and its error when the element's value changes", () => {
  const props: TweakPanelProps = {
    label: "Action", fields: fields(), computed: COMPUTED, used: [], onTweak: vi.fn(), onAdd: vi.fn(), canAdd: true,
  };
  const { rerender } = render(<TweakPanel {...props} />);
  fireEvent.change(number("Padding"), { target: { value: "abc" } });
  fireEvent.blur(number("Padding"));
  expect(screen.getByText("Use a whole number, like 8.")).toBeInTheDocument();
  rerender(<TweakPanel {...props} computed={{ ...COMPUTED, padding: "12" }} />);
  expect(screen.queryByText("Use a whole number, like 8.")).toBeNull();
  expect(number("Padding")).toHaveValue("12");
});

it("does not carry typed text or an error into another element, but keeps the DOM node for the same one", () => {
  const props: TweakPanelProps = {
    label: "A", selectionKey: "a", fields: fields(), computed: COMPUTED, used: [], onTweak: vi.fn(), onAdd: vi.fn(), canAdd: true,
  };
  const { rerender } = render(<TweakPanel {...props} />);
  const padding = number("Padding");
  padding.focus();
  fireEvent.change(number("Width"), { target: { value: "abc" } });
  fireEvent.blur(number("Width"));
  expect(screen.getByText("Use a whole number, like 8.")).toBeInTheDocument();
  rerender(<TweakPanel {...props} isPending />);
  fireEvent.change(padding, { target: { value: "77" } }); // typed while pending: ignored on blur, never applied
  fireEvent.blur(padding);
  rerender(<TweakPanel {...props} isPending={false} />);
  expect(number("Padding")).toBe(padding);
  expect(number("Padding")).toHaveValue("77");
  rerender(<TweakPanel {...props} label="B" selectionKey="b" />);
  expect(number("Padding")).toHaveValue("8");
  expect(number("Width")).toHaveValue("120");
  expect(screen.queryByText("Use a whole number, like 8.")).toBeNull();
});
