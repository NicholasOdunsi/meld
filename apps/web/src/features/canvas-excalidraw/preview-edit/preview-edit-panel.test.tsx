// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PreviewEditPanel } from "./preview-edit-panel";
import type { PreviewSelection } from "./preview-edit-store";

const style = { editable: true, value: null };
const selection: PreviewSelection = {
  starId: "s1",
  selectionId: "pick1",
  label: "p",
  tag: "p",
  html: "<p>Plan your day</p>",
  fields: {
    text: { editable: true, value: "Plan your day" },
    color: style, backgroundColor: style, fontSize: style, fontWeight: style,
    fontFamily: style, padding: style, gap: style, borderRadius: style, width: style, height: style,
  },
  computed: {
    fontFamily: "Inter", fontSize: "16px", fontWeight: "400", color: "rgb(0, 0, 0)",
    backgroundColor: "rgba(0, 0, 0, 0)", width: "100px", height: "20px",
    padding: "4px", gap: "normal", borderRadius: "0px", display: "block",
  },
  reason: null,
  locked: null,
  canUndo: true,
  canRedo: false,
  pending: false,
};

afterEach(cleanup);

describe("PreviewEditPanel", () => {
  it("uses the Tweak fields and sends direct edits", () => {
    const onRequest = vi.fn();
    render(<PreviewEditPanel selection={selection} onRequest={onRequest} />);
    const text = screen.getByDisplayValue("Plan your day");
    fireEvent.change(text, { target: { value: "Plan your week" } });
    fireEvent.keyDown(text, { key: "Enter" });
    expect(onRequest).toHaveBeenCalledWith({ kind: "tweak", field: "text", value: "Plan your week" });
  });

  it("explains missing source and only sends the description when submitted", () => {
    const onRequest = vi.fn();
    render(<PreviewEditPanel selection={{ ...selection, fields: null, reason: "Orion can't find this element's code." }} onRequest={onRequest} />);
    expect(screen.getByText(/can't find this element's code/)).toBeInTheDocument();
    const input = screen.getByRole("textbox", { name: "Tell Orion what to change" });
    fireEvent.change(input, { target: { value: "Make this a card" } });
    fireEvent.blur(input);
    expect(onRequest).not.toHaveBeenCalled();
    fireEvent.submit(input.closest("form")!);
    expect(onRequest).toHaveBeenCalledExactlyOnceWith({ kind: "describe", text: "Make this a card" });
    expect(input).toHaveValue("");
  });

  it("blocks changes while the build is running", () => {
    render(<PreviewEditPanel selection={{ ...selection, locked: "This Star is still building." }} onRequest={vi.fn()} />);
    expect(screen.getByText("This Star is still building.")).toBeInTheDocument();
    expect(screen.queryByDisplayValue("Plan your day")).toBeNull();
    expect(screen.getByRole("button", { name: "Undo" })).toBeDisabled();
    expect(screen.getByRole("textbox", { name: "Tell Orion what to change" })).toBeDisabled();
  });

  it("offers Undo and Redo as available and closes on request", () => {
    const onRequest = vi.fn();
    render(<PreviewEditPanel selection={selection} onRequest={onRequest} />);
    fireEvent.click(screen.getByRole("button", { name: "Undo" }));
    expect(onRequest).toHaveBeenCalledWith({ kind: "undo" });
    expect(screen.getByRole("button", { name: "Redo" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onRequest).toHaveBeenCalledWith({ kind: "close" });
  });
});
