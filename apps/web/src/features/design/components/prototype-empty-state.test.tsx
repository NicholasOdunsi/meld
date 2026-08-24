// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PrototypeEmptyState } from "./prototype-empty-state";

afterEach(cleanup);

describe("PrototypeEmptyState", () => {
  it("offers the user flow when the room has one", () => {
    const onStart = vi.fn();
    render(
      <PrototypeEmptyState hasUserFlow hasPrd={false} onStart={onStart} onFocusComposer={vi.fn()} />,
    );
    fireEvent.click(screen.getByRole("button", { name: /user flow/i }));
    expect(onStart).toHaveBeenCalledWith(
      "generate the first screen based on the userflow",
    );
  });

  it("offers the PRD when that is all the room has", () => {
    const onStart = vi.fn();
    render(
      <PrototypeEmptyState hasUserFlow={false} hasPrd onStart={onStart} onFocusComposer={vi.fn()} />,
    );
    expect(screen.queryByRole("button", { name: /user flow/i })).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /PRD/i }));
    expect(onStart).toHaveBeenCalledWith("generate the first screen based on the PRD");
  });

  it("prefers the user flow when the room has both", () => {
    render(<PrototypeEmptyState hasUserFlow hasPrd onStart={vi.fn()} onFocusComposer={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAccessibleName(/user flow/i);
  });

  it("falls back to the composer when the room has neither", () => {
    // No PRD and no flow means there is nothing specific to offer -- so point
    // at the one place that can start anything, rather than a dead end.
    const onFocusComposer = vi.fn();
    render(
      <PrototypeEmptyState
        hasUserFlow={false}
        hasPrd={false}
        onStart={vi.fn()}
        onFocusComposer={onFocusComposer}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /describe a screen/i }));
    expect(onFocusComposer).toHaveBeenCalled();
  });
});
