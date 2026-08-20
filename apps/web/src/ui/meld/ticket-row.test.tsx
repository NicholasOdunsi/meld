// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldTicketRow } from "./ticket-row";

afterEach(cleanup);

it("prints the ask as body copy", () => {
  render(
    <MeldTicketRow
      kind="approve"
      source="ONBOARDING · FIRST RUN"
      age="4h"
      ask="Design agent drew 2 screens and wants a yes or no."
    />,
  );

  expect(
    screen.getByText("Design agent drew 2 screens and wants a yes or no."),
  ).toBeInTheDocument();
});

it("shows where the work came from and how long it has waited", () => {
  render(
    <MeldTicketRow
      kind="review"
      source="CHECKOUT · PAYMENTS"
      age="1d"
      ask="Sam edited 3 steps in the flow."
    />,
  );

  expect(screen.getByText("CHECKOUT · PAYMENTS")).toBeInTheDocument();
  expect(screen.getByText("1d")).toBeInTheDocument();
});

it("renders its action slot", () => {
  render(
    <MeldTicketRow
      kind="approve"
      source="ONBOARDING · FIRST RUN"
      age="4h"
      ask="Two screens are waiting."
    >
      <a href="/w/rooms/r">REVIEW</a>
    </MeldTicketRow>,
  );

  expect(screen.getByRole("link", { name: "REVIEW" })).toBeInTheDocument();
});
