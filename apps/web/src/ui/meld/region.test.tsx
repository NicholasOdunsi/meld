// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldRegion } from "./region";

afterEach(cleanup);

it("renders its children", () => {
  render(<MeldRegion>{"Ticket"}</MeldRegion>);

  expect(screen.getByText("Ticket")).toBeInTheDocument();
});

it("wears the calling surface's class so that surface owns the geometry", () => {
  render(
    <MeldRegion className="deck-lead" data-testid="region">
      {"Ticket"}
    </MeldRegion>,
  );

  expect(screen.getByTestId("region")).toHaveClass("deck-lead");
});

it("adds no class of its own when the caller passes none", () => {
  render(<MeldRegion data-testid="region">{"Ticket"}</MeldRegion>);

  expect(screen.getByTestId("region").className).toBe("");
});
