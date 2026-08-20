// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldDeckFrame } from "./deck-frame";

afterEach(cleanup);

it("renders its children", () => {
  render(<MeldDeckFrame>{"Ticket"}</MeldDeckFrame>);

  expect(screen.getByText("Ticket")).toBeInTheDocument();
});

it("exposes the plane for stable targeting", () => {
  render(<MeldDeckFrame>{"Ticket"}</MeldDeckFrame>);

  expect(screen.getByTestId("deck-frame")).toBeInTheDocument();
});
