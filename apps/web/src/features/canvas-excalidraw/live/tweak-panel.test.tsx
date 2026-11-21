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

it("shows Gap for a flex container", () => {
  setup({ computed: { ...COMPUTED, display: "flex" } });
  expect(number("Gap")).toHaveValue("4");
});

it("shows the real rendered numbers, with an auto tag when the source states none", () => {
  setup({ fields: fields({ height: { value: "48" } }) });
  expect(number("Width")).toHaveValue("120");
  expect(number("Height")).toHaveValue("40");
  expect(screen.getAllByText("auto")).toHaveLength(1);
  expect(screen.getByText("Showing: ui-monospace")).toBeInTheDocument();
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
  expect(onTweak).not.toHaveBeenCalled();
  fireEvent.change(padding, { target: { value: "2.5" } });
  fireEvent.blur(padding);
  expect(onTweak).toHaveBeenCalledExactlyOnceWith({ field: "padding", value: "2.5" });
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
