// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Layout } from "@astryxdesign/core/Layout";
import { ShapePanel } from "./shape-panel";
import type { ShapeStyle } from "./shape-style";

afterEach(cleanup);

const style: ShapeStyle = { fill: null, stroke: "#1e1e1e", strokeWidth: 2, strokeStyle: "solid", rounded: false, opacity: 100 };

function setup(props: Partial<Parameters<typeof ShapePanel>[0]> = {}) {
  const onChange = vi.fn();
  const onClose = vi.fn();
  const onTextSize = vi.fn();
  render(<Layout end={<ShapePanel style={style} kind="shape" onChange={onChange} onClose={onClose} onTextSize={onTextSize} textSize={20} {...props} />} />);
  return { onChange, onClose, onTextSize };
}
const number = (name: string) => screen.getByRole("textbox", { name });
async function choose(selector: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: selector }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("ShapePanel", () => {
  it("renders every shape control in Fill, Stroke, Corners and Appearance sections", () => {
    setup();
    expect(screen.getByTestId("shape-panel")).toBeInTheDocument();
    for (const title of ["Fill", "Stroke", "Corners", "Appearance"]) expect(screen.getByRole("heading", { name: title })).toBeInTheDocument();
    for (const name of ["Fill", "Stroke"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    for (const name of ["Style", "Corners"]) expect(screen.getByRole("combobox", { name })).toBeInTheDocument();
    expect(number("Thickness")).toHaveValue("2");
    expect(number("Opacity")).toHaveValue("100");
  });

  it("has no tabs and no title text: the header is just Close", () => {
    setup();
    const panel = screen.getByTestId("shape-panel");
    expect(screen.queryByRole("tab")).toBeNull();
    expect(screen.queryByRole("tablist")).toBeNull();
    expect(screen.queryByText("Shape")).toBeNull();
    expect(screen.queryByText("Text")).toBeNull();
    const header = panel.querySelector("header");
    expect(header).not.toBeNull();
    expect(header!.textContent).toBe("");
    expect(Array.from(header!.querySelectorAll("button")).map((b) => b.getAttribute("aria-label"))).toEqual(["Close"]);
    expect(screen.getByRole("button", { name: "Close" })).toHaveClass("orion-i-iconbtn");
  });

  it("shows the Fill row's None state, and a set fill as its hex", () => {
    setup();
    const fill = screen.getByRole("button", { name: "Fill" });
    expect(fill).toHaveAccessibleDescription("None");
    expect(fill.closest(".orion-i-field")).toHaveTextContent("None");
    expect(screen.getByRole("button", { name: "Stroke" })).toHaveAccessibleDescription("1E1E1E");
    cleanup();
    setup({ style: { ...style, fill: "#ef4444" } });
    expect(screen.getByRole("button", { name: "Fill" })).toHaveAccessibleDescription("EF4444");
  });

  it("builds every field from the shared inspector look, colour rows included", () => {
    setup();
    for (const control of [screen.getByRole("button", { name: "Fill" }), screen.getByRole("button", { name: "Stroke" }), number("Thickness"), screen.getByRole("combobox", { name: "Style" }), screen.getByRole("combobox", { name: "Corners" }), number("Opacity")]) {
      expect(control.closest(".orion-i-field")).not.toBeNull();
    }
    // Opacity carries its unit as a trailing %.
    expect(number("Opacity").closest(".orion-i-field")).toHaveTextContent("%");
  });

  it("picks the colour popup surface class", () => {
    setup();
    fireEvent.click(screen.getByRole("button", { name: "Stroke" }));
    expect(document.querySelector(".orion-i-pop")).not.toBeNull();
  });

  it("hides Corners for an ellipse and both Fill and Corners for an arrow", () => {
    setup({ elementType: "ellipse" });
    expect(screen.getByRole("button", { name: "Fill" })).toBeInTheDocument();
    expect(screen.queryByRole("combobox", { name: "Corners" })).toBeNull();
    expect(screen.getByRole("combobox", { name: "Style" })).toBeInTheDocument();
    cleanup();
    setup({ elementType: "arrow" });
    expect(screen.queryByRole("button", { name: "Fill" })).toBeNull();
    expect(screen.queryByRole("combobox", { name: "Corners" })).toBeNull();
    for (const name of ["Stroke"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    expect(number("Thickness")).toBeInTheDocument();
    expect(number("Opacity")).toBeInTheDocument();
  });

  it("picks a fill colour, and None turns the fill off", () => {
    const { onChange } = setup({ style: { ...style, fill: "#ef4444" } });
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    fireEvent.click(screen.getByRole("button", { name: "#3b82f6" }));
    expect(onChange).toHaveBeenLastCalledWith({ fill: "#3b82f6" });
    fireEvent.click(screen.getByRole("button", { name: "Fill" }));
    fireEvent.click(screen.getByRole("button", { name: "None" }));
    expect(onChange).toHaveBeenLastCalledWith({ fill: null });
  });

  it("picks a stroke colour and offers no None for it", () => {
    const { onChange } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Stroke" }));
    expect(screen.queryByRole("button", { name: "None" })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "#22c55e" }));
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ stroke: "#22c55e" });
  });

  it("changes style and corners from their selectors", async () => {
    const { onChange } = setup();
    await choose("Style", "Dashed");
    expect(onChange).toHaveBeenLastCalledWith({ strokeStyle: "dashed" });
    await choose("Corners", "Rounded");
    expect(onChange).toHaveBeenLastCalledWith({ rounded: true });
  });

  it("commits thickness once on Enter or blur, with a plain-language error", () => {
    const { onChange } = setup();
    const thickness = number("Thickness");
    fireEvent.change(thickness, { target: { value: "4" } });
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.keyDown(thickness, { key: "Enter" });
    fireEvent.blur(thickness);
    expect(onChange).toHaveBeenCalledExactlyOnceWith({ strokeWidth: 4 });
    fireEvent.change(thickness, { target: { value: "thick" } });
    fireEvent.blur(thickness);
    expect(screen.getByText("Use a whole number, like 2.")).toBeInTheDocument();
    expect(onChange).toHaveBeenCalledTimes(1);
  });

  it("clamps thickness to 1 to 8 and strips a trailing px", () => {
    const { onChange } = setup();
    fireEvent.change(number("Thickness"), { target: { value: "12px" } });
    fireEvent.keyDown(number("Thickness"), { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({ strokeWidth: 8 });
    expect(number("Thickness")).toHaveValue("8");
  });

  it("steps thickness with the arrow keys, within its range", () => {
    const { onChange } = setup();
    fireEvent.keyDown(number("Thickness"), { key: "ArrowUp" });
    expect(onChange).toHaveBeenLastCalledWith({ strokeWidth: 3 });
  });

  it("commits opacity as a percentage and rejects other text", () => {
    const { onChange } = setup();
    const opacity = number("Opacity");
    fireEvent.change(opacity, { target: { value: "60%" } });
    fireEvent.keyDown(opacity, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({ opacity: 60 });
    fireEvent.change(opacity, { target: { value: "lots" } });
    fireEvent.keyDown(opacity, { key: "Enter" });
    expect(screen.getByText("Use a whole number from 0 to 100, like 80.")).toBeInTheDocument();
  });

  it("closes", () => {
    const { onClose } = setup();
    fireEvent.click(screen.getByRole("button", { name: "Close" }));
    expect(onClose).toHaveBeenCalledOnce();
  });

  it("shows only Colour and Size for text", () => {
    const { onChange, onTextSize } = setup({ kind: "text", style: { ...style, stroke: "#112233" } });
    expect(screen.queryByText("Shape")).toBeNull();
    expect(screen.getByRole("button", { name: "Colour" })).toBeInTheDocument();
    expect(number("Size")).toHaveValue("20");
    for (const name of ["Fill", "Stroke"]) expect(screen.queryByRole("button", { name })).toBeNull();
    for (const name of ["Style", "Corners"]) expect(screen.queryByRole("combobox", { name })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Thickness|Opacity/ })).toBeNull();
    for (const title of ["Fill", "Stroke", "Corners", "Appearance"]) expect(screen.queryByRole("heading", { name: title })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Colour" }));
    fireEvent.click(screen.getByRole("button", { name: "#ef4444" }));
    expect(onChange).toHaveBeenLastCalledWith({ stroke: "#ef4444" });
    fireEvent.change(number("Size"), { target: { value: "28" } });
    fireEvent.keyDown(number("Size"), { key: "Enter" });
    expect(onTextSize).toHaveBeenCalledExactlyOnceWith(28);
    fireEvent.change(number("Size"), { target: { value: "big" } });
    fireEvent.blur(number("Size"));
    expect(screen.getByText("Use a whole number, like 20.")).toBeInTheDocument();
  });

  it("shows shape colours as the dark canvas draws them (theme filter on every swatch)", () => {
    setup({ style: { ...style, fill: "#ffffff" } });
    const filter = "invert(93%) hue-rotate(180deg)";
    // The two trigger swatches (fill white, stroke #1e1e1e) are filtered like the canvas.
    const triggers = Array.from(document.querySelectorAll<HTMLElement>(".orion-i-field .orion-i-swatch[data-swatch]"));
    expect(triggers).toHaveLength(2);
    expect(triggers.every((swatch) => swatch.style.filter === filter)).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Stroke" }));
    const popup = Array.from(document.querySelectorAll<HTMLElement>(".orion-i-pop button[data-swatch]"));
    expect(popup.length).toBeGreaterThan(10);
    expect(popup.every((swatch) => swatch.style.getPropertyValue("--orion-i-pop-filter") === filter)).toBe(true);
  });

  it("keeps the same thickness box, and its focus, across steps and the element's refresh", () => {
    const onChange = vi.fn();
    const panel = (strokeWidth: number) => <Layout end={<ShapePanel style={{ ...style, strokeWidth }} kind="shape" onChange={onChange} onClose={vi.fn()} />} />;
    const { rerender } = render(panel(2));
    const thickness = number("Thickness");
    thickness.focus();
    fireEvent.keyDown(thickness, { key: "ArrowUp" });
    rerender(panel(3));
    expect(number("Thickness")).toBe(thickness);
    expect(document.activeElement).toBe(thickness);
    fireEvent.keyDown(thickness, { key: "ArrowUp" });
    expect(onChange.mock.calls).toEqual([[{ strokeWidth: 3 }], [{ strokeWidth: 4 }]]);
    rerender(panel(4));
    expect(thickness).toHaveValue("4");
  });

  it("offers Fill for a closed line (a triangle) but not an open one", () => {
    setup({ elementType: "line", closed: true });
    expect(screen.getByRole("button", { name: "Fill" })).toBeInTheDocument();
    cleanup();
    setup({ elementType: "line" });
    expect(screen.queryByRole("button", { name: "Fill" })).toBeNull();
  });
  it("drops an invalid thickness and its error when the value changes (canvas undo)", () => {
    const { rerender } = render(<Layout end={<ShapePanel style={style} kind="shape" onChange={vi.fn()} onClose={vi.fn()} />} />);
    fireEvent.change(number("Thickness"), { target: { value: "abc" } });
    fireEvent.blur(number("Thickness"));
    expect(screen.getByText("Use a whole number, like 2.")).toBeInTheDocument();
    rerender(<Layout end={<ShapePanel style={{ ...style, strokeWidth: 6 }} kind="shape" onChange={vi.fn()} onClose={vi.fn()} />} />);
    expect(number("Thickness")).toHaveValue("6");
    expect(screen.queryByText("Use a whole number, like 2.")).toBeNull();
  });

  it("drops invalid text when another shape with the same value is selected", () => {
    const panel = (key: string) => <Layout end={<ShapePanel selectionKey={key} style={style} kind="shape" onChange={vi.fn()} onClose={vi.fn()} />} />;
    const { rerender } = render(panel("one"));
    fireEvent.change(number("Thickness"), { target: { value: "abc" } });
    fireEvent.blur(number("Thickness"));
    rerender(panel("one"));
    expect(number("Thickness")).toHaveValue("abc");
    rerender(panel("two"));
    expect(number("Thickness")).toHaveValue("2");
    expect(screen.queryByText("Use a whole number, like 2.")).toBeNull();
  });
});
