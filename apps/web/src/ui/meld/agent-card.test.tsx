// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldAgentCard } from "./agent-card";

afterEach(cleanup);

function renderCard(isOpen: boolean, offsetIndex = 0) {
  render(
    <MeldAgentCard
      kind="design"
      handle="design-agent"
      sprite="purple-pocket"
      ability="SCREEN BATCH"
      abilityText="Generates and previews clickable screens."
      quote="“Give me the flow.”"
      isOpen={isOpen}
      offsetIndex={offsetIndex}
      rowCount={3}
    />,
  );
  return screen.getByTestId("agent-card");
}

it("reflects the agent kind so the slab can take its pigment", () => {
  expect(renderCard(true)).toHaveAttribute("data-kind", "design");
});

it("reflects open state for stable targeting", () => {
  expect(renderCard(true)).toHaveAttribute("data-open", "true");
});

it("is hidden from assistive tech while closed", () => {
  expect(renderCard(false)).toHaveAttribute("aria-hidden", "true");
});

it("is readable by assistive tech once open", () => {
  expect(renderCard(true)).not.toHaveAttribute("aria-hidden", "true");
});

it("shows the capability and the quote", () => {
  renderCard(true);

  expect(
    screen.getByText("Generates and previews clickable screens."),
  ).toBeInTheDocument();
  expect(screen.getByText("“Give me the flow.”")).toBeInTheDocument();
});

// One card serves all three rows, so where it stands IS the state. It is
// nudged around the block's centre rather than pinned to a row: stepping by
// the full row pitch hung it off the bottom of the page and gave the document
// a scrollbar, which is the bug these three cases exist to prevent.
it("sits centred when the middle row is open", () => {
  expect(renderCard(true, 1)).toHaveStyle({
    transform: "translateY(calc(var(--meld-agent-card-step) * 0))",
  });
});

it("nudges up for the first row", () => {
  expect(renderCard(true, 0)).toHaveStyle({
    transform: "translateY(calc(var(--meld-agent-card-step) * -1))",
  });
});

it("nudges down for the last row, by one step and not one row pitch", () => {
  expect(renderCard(true, 2)).toHaveStyle({
    transform: "translateY(calc(var(--meld-agent-card-step) * 1))",
  });
});
