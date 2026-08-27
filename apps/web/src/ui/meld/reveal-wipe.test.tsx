// @vitest-environment jsdom

import { act, cleanup, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MeldRevealWipe } from "./reveal-wipe";

afterEach(cleanup);

it("is decorative and hidden from assistive tech", () => {
  const { container } = render(<MeldRevealWipe onComplete={vi.fn()} />);

  const svg = container.querySelector("svg");
  expect(svg).toHaveAttribute("aria-hidden", "true");
  expect(svg).toHaveAttribute("role", "presentation");
  expect(svg).toHaveAttribute("focusable", "false");
});

it("covers the viewport with brand-token blocks, all starting faded in", () => {
  const { container } = render(<MeldRevealWipe onComplete={vi.fn()} />);

  const cells = container.querySelectorAll("rect");
  expect(cells.length).toBeGreaterThan(50);

  for (const cell of cells) {
    expect(cell.getAttribute("fill")).toMatch(/^var\(--meld-[a-z]+\)$/);
  }
});

it("calls onComplete exactly once, after the full cover-then-clear cycle", () => {
  vi.useFakeTimers();
  try {
    const onComplete = vi.fn();
    render(<MeldRevealWipe onComplete={onComplete} />);

    // Cover phase (sweep + fade) plus the hold aren't enough on their own.
    act(() => {
      vi.advanceTimersByTime(340 + 320 + 180);
    });
    expect(onComplete).not.toHaveBeenCalled();

    // The clear phase (another sweep + fade) finishes the cycle.
    act(() => {
      vi.advanceTimersByTime(340 + 320);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);

    // Nothing left scheduled that could fire it again.
    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  } finally {
    vi.useRealTimers();
  }
});

it("unmounting mid-transition does not throw or leave a pending call", () => {
  vi.useFakeTimers();
  try {
    const onComplete = vi.fn();
    const { unmount } = render(<MeldRevealWipe onComplete={onComplete} />);

    unmount();

    expect(() => {
      act(() => {
        vi.advanceTimersByTime(5000);
      });
    }).not.toThrow();
    expect(onComplete).not.toHaveBeenCalled();
  } finally {
    vi.useRealTimers();
  }
});
