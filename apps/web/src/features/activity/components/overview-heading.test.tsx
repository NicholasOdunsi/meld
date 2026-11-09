// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../actions", () => ({
  getWorkspaceActivity: vi.fn().mockResolvedValue([]),
}));

import { WorkspaceActivityProvider } from "../workspace-activity-provider";
import { OverviewHeading } from "./overview-heading";

afterEach(cleanup);

describe("OverviewHeading", () => {
  it("summarises counts", () => {
    render(
      <WorkspaceActivityProvider
        workspaceId="ws"
        initial={[
          {
            roomId: "a",
            projectId: "p1",
            roomName: "x",
            state: "working",
            reason: null,
            taskKind: null,
            taskStatus: null,
            provider: null,
            proposalKind: null,
            proposalMessageId: null,
            occurredAt: null,
            lastActivityAt: null,
          },
          {
            roomId: "b",
            projectId: "p2",
            roomName: "y",
            state: "needs_you",
            reason: "finished",
            taskKind: null,
            taskStatus: null,
            provider: null,
            proposalKind: null,
            proposalMessageId: null,
            occurredAt: null,
            lastActivityAt: null,
          },
        ]}
      >
        <OverviewHeading projectCount={4} />
      </WorkspaceActivityProvider>,
    );
    expect(
      screen.getByText("4 projects · 1 working · 1 needs you"),
    ).toBeInTheDocument();
    expect(screen.getByRole("heading", { level: 1 })).toBeInTheDocument();
  });
});
