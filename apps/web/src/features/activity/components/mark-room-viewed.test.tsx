// @vitest-environment jsdom

import { act, render } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomActivity } from "@meld/contracts";

const markRoomViewed = vi.fn().mockResolvedValue(undefined);
const getWorkspaceActivity = vi.fn();
vi.mock("../actions", () => ({
  markRoomViewed: (id: string) => markRoomViewed(id),
  getWorkspaceActivity: (id: string) => getWorkspaceActivity(id),
}));

import { WorkspaceActivityProvider } from "../workspace-activity-provider";
import { MarkRoomViewed } from "./mark-room-viewed";

const finished: RoomActivity = {
  roomId: "r1", projectId: "p1", roomName: "Tab", state: "needs_you", reason: "finished",
  taskKind: "room_reply", taskStatus: "completed", provider: "claude",
  proposalKind: null, proposalMessageId: null, occurredAt: "2026-11-09T10:00:00Z", lastActivityAt: null,
};

beforeEach(() => { markRoomViewed.mockClear(); getWorkspaceActivity.mockResolvedValue([]); });

describe("MarkRoomViewed", () => {
  it("marks the room viewed on mount", async () => {
    await act(async () => { render(<MarkRoomViewed roomId="r1" />); });
    expect(markRoomViewed).toHaveBeenCalledWith("r1");
  });

  it("marks again when this room turns finished while open", async () => {
    await act(async () => {
      render(
        <WorkspaceActivityProvider workspaceId="ws" initial={[finished]}>
          <MarkRoomViewed roomId="r1" />
        </WorkspaceActivityProvider>,
      );
    });
    // once for mount, once because the room is 'finished' — de-duplicated to the same occurredAt
    expect(markRoomViewed).toHaveBeenCalledTimes(2);
  });
});
