// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, expect, it } from "vitest";
import type { RoomParticipantView } from "../backend";
import type { RoomDecision, RoomOverviewData } from "../overview";
import type { PaneTool } from "../pane-layout";
import { RoomOverviewTab } from "./room-overview-tab";

afterEach(cleanup);

const basePath = "/workspace/rooms/room-1";

const overview: RoomOverviewData = {
  stage: "design",
  latestActivityAt: "2026-08-20T10:00:00.000Z",
  participantCount: 2,
  participants: [
    { userId: "user-ada", email: "ada@example.com", access: "edit" },
    { userId: "user-maya", email: "maya@example.com", access: "view" },
  ],
  counts: { userFlows: 1, prds: 1, decisions: 1 },
  recentDecisions: [
    {
      id: "decision-1",
      summary: "Keep recovery codes single-use.",
      createdAt: "2026-08-20T09:00:00.000Z",
      createdByName: "ada@example.com",
    },
  ],
};

const decisions: RoomDecision[] = [
  {
    id: "decision-1",
    sourceMessageId: "message-1",
    summary: "Keep recovery codes single-use.",
    createdAt: "2026-08-20T09:00:00.000Z",
    createdByName: "ada@example.com",
  },
];

const participants: RoomParticipantView[] = [
  {
    roomId: "room-1",
    userId: "user-ada",
    email: "ada@example.com",
    access: "edit",
  },
  {
    roomId: "room-1",
    userId: "user-maya",
    email: "maya@example.com",
    access: "view",
  },
];

const artifacts: { tool: PaneTool; label: string }[] = [
  { tool: "canvas", label: "Canvas" },
  { tool: "prototype", label: "Prototype" },
  { tool: "prd", label: "PRD" },
];

it("renders the briefing sections, decisions, people, recent activity, and tool links", () => {
  const overviewWithSummary = {
    ...overview,
    summary: "A visitor completes checkout without losing their place.",
  };

  render(
    <RoomOverviewTab
      overview={overviewWithSummary}
      decisions={decisions}
      participants={participants}
      artifacts={artifacts}
      basePath={basePath}
    />,
  );

  expect(screen.getByRole("heading", { name: "What this Room is" })).toBeInTheDocument();
  expect(
    screen.getByText("A visitor completes checkout without losing their place."),
  ).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Decisions" })).toBeInTheDocument();
  expect(
    screen.getAllByText("Keep recovery codes single-use."),
  ).toHaveLength(2);
  expect(screen.getByRole("link", { name: "View message" })).toHaveAttribute(
    "href",
    `${basePath}?tab=conversation&message=message-1`,
  );
  expect(screen.getByText("ada@example.com")).toBeInTheDocument();
  expect(screen.getByRole("heading", { name: "Recent" })).toBeInTheDocument();

  for (const artifact of artifacts) {
    expect(
      screen.getByRole("link", { name: `Open ${artifact.label}` }),
    ).toHaveAttribute("href", `${basePath}?tab=${artifact.tool}`);
  }

  expect(screen.queryByRole("button")).not.toBeInTheDocument();
  expect(screen.queryByRole("textbox")).not.toBeInTheDocument();
  expect(screen.queryByTestId("toolbar")).not.toBeInTheDocument();
  expect(screen.queryByTestId("pane")).not.toBeInTheDocument();
});

it("uses the opening message when no PRD summary exists and stays useful when empty", () => {
  const overviewWithOpening = {
    ...overview,
    openingMessage: "We need a clearer checkout recovery path.",
    recentDecisions: [],
  };

  render(
    <RoomOverviewTab
      overview={overviewWithOpening}
      decisions={[]}
      participants={[]}
      artifacts={[]}
      basePath={basePath}
    />,
  );

  expect(
    screen.getByText("We need a clearer checkout recovery path."),
  ).toBeInTheDocument();
  expect(screen.getByText("No decisions recorded yet.")).toBeInTheDocument();
  expect(screen.getByText("No artifacts recorded yet.")).toBeInTheDocument();
  expect(screen.getByText("No participants available.")).toBeInTheDocument();
  expect(screen.getByText("No recent activity yet.")).toBeInTheDocument();
});

it("shows a read-only fallback when the overview query has no result", () => {
  render(
    <RoomOverviewTab
      overview={null}
      decisions={[]}
      participants={[]}
      artifacts={[]}
      basePath={basePath}
    />,
  );

  expect(
    screen.getByText(
      "No summary or opening message yet. Start the conversation to define this Room.",
    ),
  ).toBeInTheDocument();
});
