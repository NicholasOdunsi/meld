// @vitest-environment jsdom

import { act, cleanup, fireEvent, render } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MeldPixelField } from "./pixel-field";

afterEach(cleanup);

it("is decorative and hidden from assistive tech", () => {
  const { container } = render(<MeldPixelField />);

  const svg = container.querySelector("svg");
  expect(svg).toHaveAttribute("aria-hidden", "true");
  expect(svg).toHaveAttribute("role", "presentation");
  expect(svg).toHaveAttribute("focusable", "false");
});

it("renders a scatter of squares on the grid", () => {
  const { container } = render(<MeldPixelField />);

  const rects = container.querySelectorAll("rect");
  expect(rects.length).toBeGreaterThan(50);

  for (const rect of rects) {
    // Every square sits on the 16px grid and is actually square.
    expect(Number(rect.getAttribute("x")) % 16).toBe(0);
    expect(Number(rect.getAttribute("y")) % 16).toBe(0);
    expect(rect.getAttribute("width")).toBe("16");
    expect(rect.getAttribute("height")).toBe("16");
  }
});

it("paints only from brand tokens, never a literal colour", () => {
  const { container } = render(<MeldPixelField />);

  for (const rect of container.querySelectorAll("rect")) {
    expect(rect.getAttribute("fill")).toMatch(/^var\(--meld-[a-z]+\)$/);
  }
});

it("produces identical geometry on every render", () => {
  // The field renders on the server and again on the client. A non-deterministic
  // scatter would be a hydration mismatch, so this pins the seeded PRNG.
  const first = render(<MeldPixelField />).container.innerHTML;
  cleanup();
  const second = render(<MeldPixelField />).container.innerHTML;

  expect(first).toBe(second);
});

it("is densest at the bottom edge", () => {
  const { container } = render(<MeldPixelField />);

  const rects = [...container.querySelectorAll("rect")];
  const bottomRow = Math.max(...rects.map((r) => Number(r.getAttribute("y"))));
  const inBottom = rects.filter(
    (r) => Number(r.getAttribute("y")) === bottomRow,
  ).length;
  const inTop = rects.filter((r) => r.getAttribute("y") === "0").length;

  expect(inBottom).toBeGreaterThan(inTop);
});

it("shatters a block into shards when pressed", async () => {
  const { container } = render(<MeldPixelField />);

  const block = container.querySelector<SVGRectElement>("[data-cell]");
  const key = block?.getAttribute("data-cell");
  const before = container.querySelectorAll("[data-cell]").length;

  fireEvent.pointerDown(block!);

  // The block is gone...
  expect(container.querySelector(`[data-cell="${key}"]`)).toBeNull();
  expect(container.querySelectorAll("[data-cell]")).toHaveLength(before - 1);
  // ...and shards took its place, each smaller than the block.
  const shards = [...container.querySelectorAll("rect")].filter(
    (rect) => !rect.hasAttribute("data-cell"),
  );
  expect(shards.length).toBeGreaterThan(1);
  for (const shard of shards) {
    expect(Number(shard.getAttribute("width"))).toBeLessThan(16);
  }
});

it("gives every shard its own arc, always downward", () => {
  const { container } = render(<MeldPixelField />);

  fireEvent.pointerDown(container.querySelector("[data-cell]")!);

  const shards = [...container.querySelectorAll("rect")].filter(
    (rect) => !rect.hasAttribute("data-cell"),
  );
  const arcs = shards.map((shard) => shard.getAttribute("style"));

  // Gravity: never a negative vertical offset.
  for (const arc of arcs) expect(arc).not.toMatch(/--dy:\s*-/);
  // Not all shards fly the same way.
  expect(new Set(arcs).size).toBeGreaterThan(1);
});

it("grows the block back and clears its shards", () => {
  vi.useFakeTimers();
  try {
    const { container } = render(<MeldPixelField />);
    const key = container
      .querySelector("[data-cell]")!
      .getAttribute("data-cell");

    fireEvent.pointerDown(container.querySelector("[data-cell]")!);
    expect(container.querySelector(`[data-cell="${key}"]`)).toBeNull();

    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(
      [...container.querySelectorAll("rect")].filter(
        (rect) => !rect.hasAttribute("data-cell"),
      ),
    ).toHaveLength(0);

    act(() => {
      vi.advanceTimersByTime(7000);
    });
    expect(container.querySelector(`[data-cell="${key}"]`)).not.toBeNull();
  } finally {
    vi.useRealTimers();
  }
});

it("ignores a repeated press on an already-broken block", () => {
  const { container } = render(<MeldPixelField />);

  const block = container.querySelector("[data-cell]")!;
  fireEvent.pointerDown(block);
  fireEvent.pointerDown(block);

  const shards = [...container.querySelectorAll("rect")].filter(
    (rect) => !rect.hasAttribute("data-cell"),
  );
  // One burst, not two -- the detached node can still receive a second event.
  expect(shards).toHaveLength(7);
});
