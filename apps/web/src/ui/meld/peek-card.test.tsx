// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldPeekCard } from "./peek-card";

afterEach(cleanup);

it("reflects shape and colour for stable targeting", () => {
  render(<MeldPeekCard shape="screens" color="pink" />);

  const card = screen.getByTestId("peek-card");
  expect(card).toHaveAttribute("data-shape", "screens");
  expect(card).toHaveAttribute("data-color", "pink");
});

it("is decorative", () => {
  render(<MeldPeekCard shape="doc" color="blue" />);

  expect(screen.getByTestId("peek-card")).toHaveAttribute("aria-hidden", "true");
});
