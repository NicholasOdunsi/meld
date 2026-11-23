// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { CanvasDock } from "./canvas-dock";

afterEach(cleanup);

describe("CanvasDock", () => {
  it("marks the active tool and reports a new choice", async () => {
    const onSelectTool = vi.fn();
    render(<CanvasDock activeTool="select" onSelectTool={onSelectTool} />);
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Pen" }));
    expect(onSelectTool).toHaveBeenCalledWith("pen");
  });
  it("keeps rectangle, ellipse and arrow behind one Shapes button", async () => {
    const onSelectTool = vi.fn();
    render(<CanvasDock activeTool="select" onSelectTool={onSelectTool} />);
    for (const name of ["Rectangle", "Ellipse", "Arrow"]) expect(screen.queryByRole("button", { name })).toBeNull();
    await userEvent.click(screen.getByRole("button", { name: "Shapes" }));
    await userEvent.click(await screen.findByRole("button", { name: "Ellipse" }));
    expect(onSelectTool).toHaveBeenCalledWith("ellipse");
  });
  it.each([["Line", "line"], ["Diamond", "diamond"], ["Triangle", "triangle"]] as const)("offers %s as a tool", async (name, tool) => {
    const onSelectTool = vi.fn();
    render(<CanvasDock activeTool="select" onSelectTool={onSelectTool} />);
    await userEvent.click(screen.getByRole("button", { name: "Shapes" }));
    await userEvent.click(await screen.findByRole("button", { name }));
    expect(onSelectTool).toHaveBeenCalledWith(tool);
  });
  it("lights Shapes while any shape tool is active", () => {
    render(<CanvasDock activeTool="arrow" onSelectTool={() => {}} />);
    expect(screen.getByRole("button", { name: "Shapes" })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "false");
  });
  it("hides Code until it is wired", () => {
    render(<CanvasDock activeTool={null} onSelectTool={() => {}} />);
    expect(screen.queryByRole("button", { name: "Code" })).toBeNull();
  });
  it("shows Code when wired", async () => {
    const onCode = vi.fn();
    render(<CanvasDock activeTool={null} onSelectTool={() => {}} onCode={onCode} />);
    await userEvent.click(screen.getByRole("button", { name: "Code" }));
    expect(onCode).toHaveBeenCalled();
  });
});
