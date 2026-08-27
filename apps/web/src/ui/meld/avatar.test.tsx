// @vitest-environment jsdom

import { cleanup, render } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldAvatar } from "./avatar";

afterEach(cleanup);

const fillOf = (container: HTMLElement) =>
  container.querySelector("span")?.style.getPropertyValue("--meld-avatar-fill");

it("shows the first character as the initial", () => {
  const { container } = render(<MeldAvatar name="odunsi@example.com" />);

  expect(container.textContent).toBe("o");
});

it("is hidden from assistive tech", () => {
  // The name it stands for is always rendered beside it, so announcing the
  // initial too would just be a stutter.
  const { container } = render(<MeldAvatar name="ada@example.com" />);

  expect(container.querySelector("span")).toHaveAttribute("aria-hidden", "true");
});

it("gives the same person the same colour every time", () => {
  const first = render(<MeldAvatar name="ada@example.com" />).container;
  const firstFill = fillOf(first);
  cleanup();
  const second = render(<MeldAvatar name="ada@example.com" />).container;

  expect(fillOf(second)).toBe(firstFill);
});

it("separates addresses that differ only by domain", () => {
  // The previous hash put these on the same colour -- a plain rolling sum
  // leaves near-identical strings in adjacent buckets.
  const a = render(<MeldAvatar name="odunsinicholas@lmu.edu.ng" />).container;
  const aFill = fillOf(a);
  cleanup();
  const b = render(<MeldAvatar name="odunsinicholas@gmail.com" />).container;

  expect(fillOf(b)).not.toBe(aFill);
});

it("spreads a realistic set of addresses across several tones", () => {
  const names = [
    "ada@example.com",
    "grace@example.com",
    "alan@example.com",
    "katherine@example.com",
    "edsger@example.com",
    "barbara@example.com",
  ];

  const fills = new Set(
    names.map((name) => {
      const { container } = render(<MeldAvatar name={name} />);
      const fill = fillOf(container);
      cleanup();
      return fill;
    }),
  );

  expect(fills.size).toBeGreaterThanOrEqual(4);
});

it("paints only from brand tokens", () => {
  const { container } = render(<MeldAvatar name="ada@example.com" />);

  expect(fillOf(container)).toMatch(/^var\(--meld-[a-z-]+\)$/);
});
