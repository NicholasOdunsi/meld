// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomActivity } from "@meld/contracts";

vi.mock("../actions", () => ({
  getWorkspaceActivity: vi.fn().mockResolvedValue([]),
}));

import { WorkspaceActivityProvider } from "../workspace-activity-provider";
import { AllProjectsList } from "./all-projects-list";

const projects = [
  { id: "p1", name: "Orion", icon: "rocket", color: "blue" },
  { id: "p2", name: "Portfolio", icon: "rocket", color: "gray" },
] as never;
const working: RoomActivity = {
  roomId: "r1",
  projectId: "p1",
  roomName: "Mac frame",
  state: "working",
  reason: null,
  taskKind: "room_reply",
  taskStatus: "running",
  provider: "claude",
  proposalKind: null,
  proposalMessageId: null,
  occurredAt: null,
  lastActivityAt: "2026-11-09T10:00:00Z",
};

afterEach(cleanup);

describe("AllProjectsList", () => {
  it("shows each project with its status line and a link", () => {
    render(
      <WorkspaceActivityProvider workspaceId="ws" initial={[working]}>
        <AllProjectsList
          workspaceId="ws"
          projects={projects}
          tabCounts={{ p1: 3, p2: 1 }}
        />
      </WorkspaceActivityProvider>,
    );
    expect(screen.getByText(/Working on Mac frame…/)).toBeInTheDocument();
    expect(screen.getByText(/No activity yet/)).toBeInTheDocument();
    expect(screen.getByRole("link", { name: /Orion/ })).toHaveAttribute(
      "href",
      "/ws/projects/p1",
    );
    expect(screen.getByRole("img", { name: "Orion: working" })).not.toHaveAttribute(
      "data-hop",
    );
  });
});
