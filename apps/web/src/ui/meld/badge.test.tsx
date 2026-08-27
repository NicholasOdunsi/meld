// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldBadge } from "./badge";

afterEach(cleanup);

it("renders the label", () => {
  render(<MeldBadge label="Admin" tone="sky" />);

  expect(screen.getByText("Admin")).toBeInTheDocument();
});

it("reflects the tone for stable targeting", () => {
  render(<MeldBadge label="Engineer" tone="green" />);

  expect(screen.getByText("Engineer")).toHaveAttribute("data-tone", "green");
});

it("falls back to neutral", () => {
  render(<MeldBadge label="Member" />);

  expect(screen.getByText("Member")).toHaveAttribute("data-tone", "neutral");
});
