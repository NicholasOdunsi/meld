// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldPlane } from "./plane";

afterEach(cleanup);

it("renders the panes it is given", () => {
  render(
    <MeldPlane>
      <span>a pane</span>
    </MeldPlane>,
  );

  expect(screen.getByText("a pane")).toBeInTheDocument();
});

it("renders the toolbar slot", () => {
  render(<MeldPlane toolbar={<span>tools</span>}>{null}</MeldPlane>);

  expect(screen.getByText("tools")).toBeInTheDocument();
});

it("renders the dock slot", () => {
  render(<MeldPlane dock={<span>dock</span>}>{null}</MeldPlane>);

  expect(screen.getByText("dock")).toBeInTheDocument();
});

it("marks the pane grid for stable targeting", () => {
  render(<MeldPlane>{null}</MeldPlane>);

  expect(screen.getByTestId("plane-grid")).toHaveAttribute(
    "data-pane-grid",
    "true",
  );
});
