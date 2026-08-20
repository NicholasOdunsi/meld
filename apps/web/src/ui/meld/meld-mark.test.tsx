// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldMark } from "./meld-mark";

afterEach(cleanup);

it("is hidden from assistive tech when decorative", () => {
  const { container } = render(<MeldMark />);

  const svg = container.querySelector("svg");
  expect(svg).toHaveAttribute("aria-hidden", "true");
  expect(svg).toHaveAttribute("role", "presentation");
});

it("becomes a named image when given a title", () => {
  render(<MeldMark title="Meld" />);

  const svg = screen.getByRole("img", { name: "Meld" });
  expect(svg).not.toHaveAttribute("aria-hidden");
});

it("paints with currentColor so it inherits the surrounding colour", () => {
  // The old asset baked #fff into the negative space, which showed as a white
  // square on any non-white surface. Nothing here may reintroduce a literal.
  const { container } = render(<MeldMark />);

  const path = container.querySelector("path");
  expect(path).toHaveAttribute("fill", "currentColor");
});

it("knocks the inner shapes out with evenodd rather than overpainting them", () => {
  const { container } = render(<MeldMark />);

  // One path, four subpaths: the outer squircle plus the four stair-steps that
  // must read as holes. A second <path> would mean the steps are painted over
  // the surface again.
  const paths = container.querySelectorAll("path");
  expect(paths).toHaveLength(1);
  expect(paths[0]).toHaveAttribute("fill-rule", "evenodd");
  expect(paths[0]?.getAttribute("d")?.match(/M/g)).toHaveLength(5);
});

it("sizes to the requested px on both axes", () => {
  const { container } = render(<MeldMark size={32} />);

  const svg = container.querySelector("svg");
  expect(svg).toHaveAttribute("width", "32");
  expect(svg).toHaveAttribute("height", "32");
  expect(svg).toHaveAttribute("viewBox", "0 0 16 16");
});
