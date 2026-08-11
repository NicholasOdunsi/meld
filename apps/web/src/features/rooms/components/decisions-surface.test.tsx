// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { RoomDecision } from "../overview";
import { DecisionsSurface } from "./decisions-surface";

afterEach(cleanup);

const decisions: RoomDecision[] = [
  {
    id: "40000000-0000-4000-8000-000000000001",
    sourceMessageId: "50000000-0000-4000-8000-000000000001",
    summary: "Keep recovery codes single-use.",
    createdAt: "2026-08-09T09:00:00.000Z",
    createdByName: "ada@example.com",
  },
  {
    id: "40000000-0000-4000-8000-000000000002",
    sourceMessageId: null,
    summary: "Use passkeys as the primary sign-in method.",
    createdAt: "2026-08-10T10:00:00.000Z",
    createdByName: "maya@example.com",
  },
];

it("renders one chronological edge-to-edge list with source links only when available", () => {
  render(
    <DecisionsSurface
      decisions={[...decisions].reverse()}
      basePath="/workspace/rooms/room"
    />,
  );

  const list = screen.getByRole("list", { name: "Room decisions" });
  const rows = within(list).getAllByRole("listitem");
  expect(rows).toHaveLength(2);
  expect(rows[0]).toHaveTextContent("Keep recovery codes single-use.");
  expect(rows[0]).toHaveTextContent("ada@example.com");
  expect(rows[1]).toHaveTextContent(
    "Use passkeys as the primary sign-in method.",
  );

  expect(
    screen.getByRole("link", {
      name: /Keep recovery codes single-use.*ada@example.com/i,
    }),
  ).toHaveAttribute(
    "href",
    "/workspace/rooms/room?tab=conversation&message=50000000-0000-4000-8000-000000000001",
  );
  expect(
    screen.queryByRole("link", {
      name: /Use passkeys as the primary sign-in method/i,
    }),
  ).not.toBeInTheDocument();
  expect(screen.queryByTestId("decision-card")).not.toBeInTheDocument();
});

it("renders a specific empty state without an empty list", () => {
  render(
    <DecisionsSurface decisions={[]} basePath="/workspace/rooms/room" />,
  );

  expect(screen.getByText("No decisions recorded yet")).toBeInTheDocument();
  expect(screen.queryByRole("list")).not.toBeInTheDocument();
});
