// @vitest-environment jsdom
import { expect, it, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { afterEach } from "vitest";
import type { Inspection } from "@meld/screen-runtime/edit/types";
import { TweakPanel, labels } from "./tweak-panel";
afterEach(cleanup);
it("labels every field, respects computed ownership and commits Enter/blur once", () => {
  const fields = Object.fromEntries(
    Object.keys(labels).map((key) => [
      key,
      { editable: key !== "text", value: null },
    ]),
  ) as Inspection;
  const onTweak = vi.fn(),
    onAdd = vi.fn();
  render(
    <TweakPanel
      fields={fields}
      picking={false}
      selectedLabel={'Action <script>"'}
      canUndo
      canRedo={false}
      onTogglePick={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onTweak={onTweak}
      onAdd={onAdd}
      canAdd
    />,
  );
  expect(screen.getByRole("textbox", { name: "Text" })).toBeDisabled();
  for (const label of Object.values(labels))
    expect(screen.getByRole("textbox", { name: label })).toBeInTheDocument();
  const padding = screen.getByRole("textbox", { name: "Padding (px)" });
  fireEvent.change(padding, { target: { value: "16" } });
  fireEvent.keyDown(padding, { key: "Enter" });
  fireEvent.blur(padding);
  expect(onTweak).toHaveBeenCalledExactlyOnceWith({
    field: "padding",
    value: "16",
  });
  expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
  fireEvent.click(screen.getByRole("button", { name: "Add to chat" }));
  expect(onAdd).toHaveBeenCalledOnce();
  expect(screen.getByText('Action <script>"')).toBeInTheDocument();
});
it("keeps invalid intermediate values local and explains unavailable chat", () => {
  const fields = Object.fromEntries(
    Object.keys(labels).map((key) => [key, { editable: true, value: null }]),
  ) as Inspection;
  const onTweak = vi.fn();
  render(
    <TweakPanel
      fields={fields}
      picking={false}
      selectedLabel="Action"
      canUndo={false}
      canRedo={false}
      onTogglePick={vi.fn()}
      onUndo={vi.fn()}
      onRedo={vi.fn()}
      onTweak={onTweak}
      onAdd={vi.fn()}
      canAdd={false}
      addReason="Save this screen first."
    />,
  );
  const gap = screen.getByRole("textbox", { name: "Gap (px)" });
  fireEvent.change(gap, { target: { value: "-2" } });
  fireEvent.blur(gap);
  expect(onTweak).not.toHaveBeenCalled();
  fireEvent.change(gap, { target: { value: "2.5" } });
  fireEvent.blur(gap);
  expect(onTweak).toHaveBeenCalledExactlyOnceWith({
    field: "gap",
    value: "2.5",
  });
  expect(screen.getByText("Save this screen first.")).toBeInTheDocument();
});
