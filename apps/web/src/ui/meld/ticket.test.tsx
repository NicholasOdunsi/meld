// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { MeldTicket } from "./ticket";

afterEach(cleanup);

it("prints its heading and count", () => {
  render(
    <MeldTicket title="PENDING" count={4} subtitle="MELD STUDIO · THU 20 AUG">
      {"rows"}
    </MeldTicket>,
  );

  expect(screen.getByText("PENDING")).toBeInTheDocument();
  expect(screen.getByText("04")).toBeInTheDocument();
});

it("pads the count to two digits and stops at 99", () => {
  render(
    <MeldTicket title="PENDING" count={128} subtitle="MELD STUDIO">
      {"rows"}
    </MeldTicket>,
  );

  expect(screen.getByText("99+")).toBeInTheDocument();
});

it("renders children and footer", () => {
  render(
    <MeldTicket title="PENDING" count={0} subtitle="MELD STUDIO" footer={"crew"}>
      {"NOTHING PENDING"}
    </MeldTicket>,
  );

  expect(screen.getByText("NOTHING PENDING")).toBeInTheDocument();
  expect(screen.getByText("crew")).toBeInTheDocument();
});
