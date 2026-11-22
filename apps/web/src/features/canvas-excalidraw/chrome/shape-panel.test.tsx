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
const number = (name: string) => screen.getByRole("textbox", { name: new RegExp(`^${name}( \\(.+\\))?$`) });
async function choose(selector: string, option: string) {
  fireEvent.click(screen.getByRole("combobox", { name: selector }));
  fireEvent.click(await screen.findByRole("option", { name: option }));
}

describe("ShapePanel", () => {
  it("renders every shape control under the Shape title", () => {
    setup();
    expect(screen.getByText("Shape")).toBeInTheDocument();
    expect(screen.getByTestId("shape-panel")).toBeInTheDocument();
    for (const name of ["Fill", "Stroke"]) expect(screen.getByRole("button", { name })).toBeInTheDocument();
    for (const name of ["Style", "Corners"]) expect(screen.getByRole("combobox", { name })).toBeInTheDocument();
    expect(number("Thickness")).toHaveValue("2");
    expect(number("Opacity")).toHaveValue("100");
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
    expect(screen.getByText("Text")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Colour" })).toBeInTheDocument();
    expect(number("Size")).toHaveValue("20");
    for (const name of ["Fill", "Stroke"]) expect(screen.queryByRole("button", { name })).toBeNull();
    for (const name of ["Style", "Corners"]) expect(screen.queryByRole("combobox", { name })).toBeNull();
    expect(screen.queryByRole("textbox", { name: /Thickness|Opacity/ })).toBeNull();
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
    const filtered = () => Array.from(document.querySelectorAll<SVGCircleElement>("circle[data-swatch]"));
    // The two trigger swatches (fill white, stroke #1e1e1e) are filtered like the canvas.
    expect(document.querySelectorAll("button[aria-label='Fill'] circle[data-swatch], button[aria-label='Stroke'] circle[data-swatch]")).toHaveLength(2);
    expect(filtered().length).toBeGreaterThanOrEqual(2);
    expect(filtered().every((c) => c.style.filter === "invert(93%) hue-rotate(180deg)")).toBe(true);
    fireEvent.click(screen.getByRole("button", { name: "Stroke" }));
    expect(filtered().every((c) => c.style.filter === "invert(93%) hue-rotate(180deg)")).toBe(true);
  });
});
