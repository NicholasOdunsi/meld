// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldColumnHeading } from "./column-heading";

afterEach(cleanup);

it("renders the label and the count", () => {
  render(<MeldColumnHeading label="PROJECTS" count={3} />);

  expect(screen.getByText("PROJECTS")).toBeInTheDocument();
  expect(screen.getByText("3")).toBeInTheDocument();
});

it("prints a zero count rather than hiding it", () => {
  render(<MeldColumnHeading label="PROJECTS" count={0} />);

  expect(screen.getByText("0")).toBeInTheDocument();
});
