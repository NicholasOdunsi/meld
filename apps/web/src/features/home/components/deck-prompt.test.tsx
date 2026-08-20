// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { DeckPrompt } from "./deck-prompt";

afterEach(cleanup);

it("is a labelled text box", () => {
  render(<DeckPrompt />);

  expect(
    screen.getByRole("textbox", { name: /what are we doing today/i }),
  ).toBeInTheDocument();
});

it("carries the deck prompt id so shortcuts can focus it", () => {
  render(<DeckPrompt />);

  expect(screen.getByRole("textbox")).toHaveAttribute("id", "deck-prompt");
});
