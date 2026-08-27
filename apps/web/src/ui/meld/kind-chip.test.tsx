// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldKindChip } from "./kind-chip";

afterEach(cleanup);

it("prints the kind in upper case", () => {
  render(<MeldKindChip kind="approve" />);

  expect(screen.getByText("APPROVE")).toBeInTheDocument();
});

it("reflects the kind for stable targeting", () => {
  render(<MeldKindChip kind="stale" />);

  expect(screen.getByText("STALE")).toHaveAttribute("data-kind", "stale");
});

it("labels a failed run", () => {
  render(<MeldKindChip kind="failed" />);

  expect(screen.getByText("FAILED")).toBeInTheDocument();
});
