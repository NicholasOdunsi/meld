// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomActivity } from "@meld/contracts";
import { WorkspaceActivityProvider } from "@/features/activity/workspace-activity-provider";
import { ProjectTabs, splitProjectTabs } from "./project-tabs";

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

vi.mock("@/features/activity/actions", () => ({
  getWorkspaceActivity: vi.fn().mockResolvedValue([]),
}));

vi.mock("@/features/projects/actions", () => ({
  createProjectTab: vi.fn(),
}));

const tabs = Array.from({ length: 8 }, (_, i) => ({
  id: `t${i}`,
  name: `Tab ${i}`,
}));

const working: RoomActivity = {
  roomId: "t0",
  projectId: "p1",
  roomName: "Tab 0",
  state: "working",
  reason: null,
  taskKind: "room_reply",
  taskStatus: "running",
  provider: "claude",
  proposalKind: null,
  proposalMessageId: null,
  occurredAt: null,
  lastActivityAt: null,
};

afterEach(cleanup);

describe("splitProjectTabs", () => {
  it("shows up to six tabs inline", () => {
    const { visible, overflow } = splitProjectTabs(tabs.slice(0, 6), "t0");
    expect(visible).toHaveLength(6);
    expect(overflow).toEqual([]);
  });

  it("puts the rest under More", () => {
    const { visible, overflow } = splitProjectTabs(tabs, "t0");
    expect(visible.map((t) => t.id)).toEqual([
      "t0",
      "t1",
      "t2",
      "t3",
      "t4",
      "t5",
    ]);
    expect(overflow.map((t) => t.id)).toEqual(["t6", "t7"]);
  });

  it("keeps the selected tab visible", () => {
    const { visible, overflow } = splitProjectTabs(tabs, "t7");
    expect(visible.at(-1)?.id).toBe("t7");
    expect(overflow.map((t) => t.id)).toEqual(["t5", "t6"]);
  });
});

describe("ProjectTabs activity hats", () => {
  it("shows a non-hopping working hat on the matching tab", () => {
    render(
      <WorkspaceActivityProvider workspaceId="ws" initial={[working]}>
        <ProjectTabs
          workspaceId="ws"
          project={{
            id: "p1",
            workspaceId: "ws",
            name: "Mail",
            createdBy: "u",
            icon: "folder",
            color: "blue",
          }}
          tabs={[{ id: "t0", name: "Tab 0" }]}
          selectedRoomId="t0"
        />
      </WorkspaceActivityProvider>,
    );
    const hat = screen.getByRole("img", { name: "Tab 0: working" });
    expect(hat).toBeInTheDocument();
    expect(hat).not.toHaveAttribute("data-hop");
  });
});
