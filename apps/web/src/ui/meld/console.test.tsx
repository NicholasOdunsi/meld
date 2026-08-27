// @vitest-environment jsdom

import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import { MeldConsoleTeammate } from "./console";

afterEach(cleanup);

function renderTeammate(overrides: Partial<Parameters<typeof MeldConsoleTeammate>[0]> = {}) {
  const onOpenChange = vi.fn();
  render(
    <MeldConsoleTeammate
      sprite={null}
      name="design-agent"
      description="Generates and previews screens"
      isOpen={false}
      onOpenChange={onOpenChange}
      {...overrides}
    />,
  );
  return { onOpenChange, row: screen.getByRole("button") };
}

it("says what the agent does without being hovered", () => {
  renderTeammate();

  expect(
    screen.getByText("Generates and previews screens"),
  ).toBeInTheDocument();
});

it("opens on hover", () => {
  const { onOpenChange, row } = renderTeammate();

  fireEvent.mouseEnter(row);

  expect(onOpenChange).toHaveBeenCalledWith(true);
});

it("closes when the pointer leaves", () => {
  const { onOpenChange, row } = renderTeammate({ isOpen: true });

  fireEvent.mouseLeave(row);

  expect(onOpenChange).toHaveBeenCalledWith(false);
});

// The whole interaction is worthless to a keyboard user if only the mouse can
// reach it, so focus has to do exactly what hover does.
it("opens on keyboard focus too", () => {
  const { onOpenChange, row } = renderTeammate();

  fireEvent.focus(row);

  expect(onOpenChange).toHaveBeenCalledWith(true);
});

it("announces whether the card is open", () => {
  const { row } = renderTeammate({ isOpen: true });

  expect(row).toHaveAttribute("aria-expanded", "true");
});

it("reflects lean and emphasis for stable targeting", () => {
  renderTeammate({ lean: -1, isEmphasised: true });

  const teammate = screen.getByTestId("console-teammate");
  expect(teammate).toHaveAttribute("data-lean", "-1");
  expect(teammate).toHaveAttribute("data-emphasis", "true");
});
