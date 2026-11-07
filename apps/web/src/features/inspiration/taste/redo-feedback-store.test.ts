// @vitest-environment jsdom
import { act, renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { dismissRedoFeedback, REDO_FEEDBACK_TIMEOUT_MS, requestRedoFeedback, useRedoFeedback } from "./redo-feedback-store";

afterEach(() => {
  dismissRedoFeedback();
  vi.useRealTimers();
});

describe("redo feedback store", () => {
  it("shows the latest request and hides itself after 20 seconds", () => {
    vi.useFakeTimers();
    const { result } = renderHook(() => useRedoFeedback());
    expect(result.current).toBeNull();
    act(() => requestRedoFeedback("s1"));
    expect(result.current).toEqual({ screenId: "s1" });
    act(() => vi.advanceTimersByTime(REDO_FEEDBACK_TIMEOUT_MS));
    expect(result.current).toBeNull();
  });
});
