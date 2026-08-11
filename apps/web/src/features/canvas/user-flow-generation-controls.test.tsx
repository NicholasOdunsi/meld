// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import { UserFlowGenerationControls } from "./user-flow-generation-controls";

const state = {
  status: "needs_context" as const,
  taskId: null,
  message: "Add the missing context.",
  start: vi.fn(),
};

afterEach(cleanup);

describe("UserFlowGenerationControls", () => {
  it("hides generation controls from viewers", () => {
    render(<UserFlowGenerationControls access="view" state={state} onGenerate={vi.fn()} />);
    expect(screen.queryByTestId("user-flow-generation-controls")).not.toBeInTheDocument();
  });

  it("requires clarification text before generating missing context", async () => {
    const onGenerate = vi.fn();
    const user = userEvent.setup();
    render(<UserFlowGenerationControls access="edit" state={state} onGenerate={onGenerate} />);
    const submit = screen.getByRole("button", { name: "Generate with context" });
    expect(submit).toBeDisabled();
    await user.type(screen.getByRole("textbox"), "Start at sign in and restore account access.");
    expect(submit).toBeEnabled();
    await user.click(submit);
    expect(onGenerate).toHaveBeenCalledWith("Start at sign in and restore account access.");
  });

  it("keeps generation as a secondary canvas command", () => {
    render(<UserFlowGenerationControls
      access="edit"
      state={{ ...state, status: "idle", message: null }}
      onGenerate={vi.fn()}
    />);

    expect(screen.getByRole("button", { name: "Generate User Flow" }))
      .toHaveAttribute("data-variant", "secondary");
  });
});
