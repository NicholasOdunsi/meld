// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";

const actions = vi.hoisted(() => ({ recordTasteSignal: vi.fn(async () => ({ status: "saved" })) }));
vi.mock("../taste/taste-actions", () => actions);

import { dismissRedoFeedback, requestRedoFeedback } from "../taste/redo-feedback-store";
import { RedoFeedbackRow } from "./redo-feedback-row";

afterEach(() => {
  cleanup();
  dismissRedoFeedback();
  actions.recordTasteSignal.mockClear();
});

describe("RedoFeedbackRow", () => {
  it("records one tap and disappears", async () => {
    render(<RedoFeedbackRow />);
    expect(screen.queryByText("What was off?")).toBeNull();
    act(() => requestRedoFeedback("00000000-0000-4000-8000-000000000001"));
    await userEvent.click(screen.getByRole("button", { name: "Too plain" }));
    expect(actions.recordTasteSignal).toHaveBeenCalledWith({ screenId: "00000000-0000-4000-8000-000000000001", reason: "too_plain" });
    expect(screen.queryByText("What was off?")).toBeNull();
  });

  it("Skip records nothing", async () => {
    render(<RedoFeedbackRow />);
    act(() => requestRedoFeedback("00000000-0000-4000-8000-000000000001"));
    await userEvent.click(screen.getByRole("button", { name: "Skip" }));
    expect(actions.recordTasteSignal).not.toHaveBeenCalled();
  });
});
