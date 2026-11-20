// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { CanvasDock } from "./canvas-dock";

describe("CanvasDock", () => {
  it("marks the active tool and reports a new choice", async () => {
    const onSelectTool = vi.fn();
    render(<CanvasDock activeTool="select" onSelectTool={onSelectTool} />);
    expect(screen.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "Pen" }));
    expect(onSelectTool).toHaveBeenCalledWith("pen");
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
