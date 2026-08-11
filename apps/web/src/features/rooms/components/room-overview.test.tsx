// @vitest-environment jsdom

import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { RoomOverviewData } from "../overview";
import { RoomOverview } from "./room-overview";

afterEach(cleanup);

const overview: RoomOverviewData = {
  stage: "design",
  latestActivityAt: "2026-08-11T08:00:00.000Z",
  participantCount: 4,
  participants: [
    { userId: "user-a", email: "ada@example.com", access: "edit" },
    { userId: "user-b", email: "maya@example.com", access: "view" },
  ],
  counts: { userFlows: 1, prds: 2, decisions: 4 },
  recentDecisions: [
    {
      id: "decision-d",
      summary: "Keep recovery codes single-use.",
      createdAt: "2026-08-10T12:00:00.000Z",
      createdByName: "ada@example.com",
    },
    {
      id: "decision-c",
      summary: "Use passkeys for sign-in.",
      createdAt: "2026-08-08T12:00:00.000Z",
      createdByName: "maya@example.com",
    },
  ],
};

it("renders deterministic stage, activity, participant, artifact, and decision summaries", () => {
  render(<RoomOverview overview={overview} />);

  expect(screen.getByRole("heading", { name: "Overview" })).toBeInTheDocument();
  expect(screen.getByText("Design")).toBeInTheDocument();
  expect(screen.getByText("4 participants")).toBeInTheDocument();
  const participants = screen.getByRole("list", {
    name: "Room participants",
  });
  expect(within(participants).getAllByRole("listitem")).toHaveLength(2);
  expect(within(participants).getByText("ada@example.com")).toBeInTheDocument();
  expect(within(participants).getByText("Can edit")).toBeInTheDocument();
  expect(within(participants).getByText("maya@example.com")).toBeInTheDocument();
  expect(within(participants).getByText("Can view")).toBeInTheDocument();

  const artifacts = screen.getByRole("list", { name: "Artifact counts" });
  expect(within(artifacts).getByText("User flows")).toBeInTheDocument();
  expect(within(artifacts).getByText("1")).toBeInTheDocument();
  expect(within(artifacts).getByText("PRDs")).toBeInTheDocument();
  expect(within(artifacts).getByText("2")).toBeInTheDocument();
  expect(within(artifacts).getByText("Decisions")).toBeInTheDocument();
  expect(within(artifacts).getByText("4")).toBeInTheDocument();

  const recent = screen.getByRole("list", { name: "Recent decisions" });
  expect(within(recent).getAllByRole("listitem")).toHaveLength(2);
  expect(within(recent).getAllByRole("listitem")[0]).toHaveTextContent(
    "Keep recovery codes single-use.",
  );
  expect(screen.queryByTestId("overview-card")).not.toBeInTheDocument();
  expect(screen.queryByText(/generated|synthesized/i)).not.toBeInTheDocument();
});

it("handles zero counts and no recent decisions without inventing a summary", () => {
  render(
    <RoomOverview
      overview={{
        ...overview,
        participantCount: 1,
        participants: [],
        counts: { userFlows: 0, prds: 0, decisions: 0 },
        recentDecisions: [],
      }}
    />,
  );

  expect(screen.getByText("1 participant")).toBeInTheDocument();
  expect(screen.getByText("No decisions recorded yet")).toBeInTheDocument();
});
