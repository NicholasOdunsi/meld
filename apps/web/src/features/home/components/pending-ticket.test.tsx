// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import { PendingTicket } from "./pending-ticket";
import type { AttentionItem } from "../attention/types";

afterEach(cleanup);

const NOW = new Date("2026-08-20T12:00:00.000Z");

function item(overrides: Partial<AttentionItem> = {}): AttentionItem {
  return {
    id: "item-1",
    kind: "approval_request",
    title: "An agent finished and is waiting on your yes or no.",
    roomId: "room-1",
    roomName: "First run",
    projectName: "Onboarding",
    occurredAt: "2026-08-20T08:00:00.000Z",
    href: "/w/rooms/room-1",
    actionLabel: "REVIEW",
    ...overrides,
  };
}

it("prints the count and a row per item", () => {
  render(
    <PendingTicket items={[item(), item({ id: "item-2" })]} printedOn={NOW} />,
  );

  expect(screen.getByText("02")).toBeInTheDocument();
  expect(screen.getAllByText("APPROVE")).toHaveLength(2);
});

it("builds the source line from project and room", () => {
  render(<PendingTicket items={[item()]} printedOn={NOW} />);

  expect(screen.getByText("ONBOARDING · FIRST RUN")).toBeInTheDocument();
});

it("shows the age of each item", () => {
  render(<PendingTicket items={[item()]} printedOn={NOW} />);

  expect(screen.getByText("4h")).toBeInTheDocument();
});

it("links the action to the room", () => {
  render(<PendingTicket items={[item()]} printedOn={NOW} />);

  expect(screen.getByRole("link", { name: "REVIEW" })).toHaveAttribute(
    "href",
    "/w/rooms/room-1",
  );
});

it("shows only the first four and counts the rest", () => {
  const items = Array.from({ length: 6 }, (_, index) =>
    item({ id: `item-${index}` }),
  );

  render(<PendingTicket items={items} printedOn={NOW} />);

  expect(screen.getAllByText("APPROVE")).toHaveLength(4);
  expect(screen.getByText("↓ 2 MORE")).toBeInTheDocument();
});

it("keeps its shape when nothing is pending", () => {
  render(<PendingTicket items={[]} printedOn={NOW} />);

  expect(screen.getByText("00")).toBeInTheDocument();
  expect(screen.getByText("NOTHING PENDING")).toBeInTheDocument();
  expect(screen.getAllByTestId("agent-sprite")).toHaveLength(2);
});

it("works the design sprite only when an agent is running", () => {
  const { rerender } = render(
    <PendingTicket items={[]} printedOn={NOW} isAgentWorking />,
  );
  expect(screen.getByTestId("agent-meter")).toBeInTheDocument();

  rerender(<PendingTicket items={[]} printedOn={NOW} />);
  expect(screen.queryByTestId("agent-meter")).not.toBeInTheDocument();
});

it("has the PM sprite waiting only when something is pending", () => {
  render(<PendingTicket items={[item()]} printedOn={NOW} />);

  expect(screen.getByText("PM · WAITING")).toBeInTheDocument();
});
