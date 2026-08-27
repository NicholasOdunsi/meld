// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldKeycap } from "./keycap";

afterEach(cleanup);

it("renders the key combo", () => {
  render(<MeldKeycap>⌘K</MeldKeycap>);

  expect(screen.getByText("⌘K")).toBeInTheDocument();
});

it("renders a different combo verbatim", () => {
  render(<MeldKeycap>⇧⌘N</MeldKeycap>);

  expect(screen.getByText("⇧⌘N")).toBeInTheDocument();
});
