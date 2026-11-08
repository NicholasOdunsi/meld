// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SelectionBar } from "./selection-bar";

afterEach(cleanup);

describe("SelectionBar", () => {
  it("shows the count and runs each action", () => {
    const add = vi.fn();
    const clear = vi.fn();
    render(<SelectionBar count={3} actions={[{ label: "Add to room…", variant: "primary", onClick: add }]} onClear={clear} />);
    expect(screen.getByText("3 selected")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Add to room…" }));
    fireEvent.click(screen.getByRole("button", { name: "Clear" }));
    expect(add).toHaveBeenCalled();
    expect(clear).toHaveBeenCalled();
  });

  it("renders nothing when nothing is selected", () => {
    const { container } = render(<SelectionBar count={0} actions={[]} onClear={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });
});
