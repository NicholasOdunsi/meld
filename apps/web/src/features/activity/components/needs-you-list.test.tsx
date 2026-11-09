// @vitest-environment jsdom

import { cleanup, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { RoomActivity } from "@meld/contracts";

const dismissRoomAttention = vi.fn().mockResolvedValue(undefined);
const dismissProposal = vi.fn().mockResolvedValue(undefined);
vi.mock("../actions", () => ({
  dismissRoomAttention: (id: string) => dismissRoomAttention(id),
  dismissProposal: (id: string) => dismissProposal(id),
  getWorkspaceActivity: vi.fn().mockResolvedValue([]),
}));
vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn(), push: vi.fn() }),
}));

import { WorkspaceActivityProvider } from "../workspace-activity-provider";
import { NeedsYouList } from "./needs-you-list";

const project = {
  id: "p1",
  name: "Mark",
  icon: "rocket",
  color: "orange",
} as never;
const base: RoomActivity = {
  roomId: "r1",
  projectId: "p1",
  roomName: "Onboarding",
  state: "needs_you",
  reason: "asked",
  taskKind: "room_reply",
  taskStatus: "completed",
  provider: "claude",
  proposalKind: "prd_generate",
  proposalMessageId: "m1",
  occurredAt: "2026-11-09T10:00:00Z",
  lastActivityAt: null,
};

function renderList(rooms: RoomActivity[]) {
  return render(
    <WorkspaceActivityProvider workspaceId="ws" initial={rooms}>
      <NeedsYouList workspaceId="ws" projects={[project]} mentions={[]} />
    </WorkspaceActivityProvider>,
  );
}

afterEach(() => {
  cleanup();
  dismissRoomAttention.mockClear();
  dismissProposal.mockClear();
});

describe("NeedsYouList", () => {
  it("lists an asked item with project › tab and an Answer link to the room", () => {
    renderList([base]);
    expect(screen.getByText("Write the PRD?")).toBeInTheDocument();
    expect(screen.getByText("Mark › Onboarding")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Answer" })).toHaveAttribute(
      "href",
      "/ws/rooms/r1",
    );
  });
  it("dismissing an asked item dismisses the proposal", async () => {
    renderList([base]);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismissProposal).toHaveBeenCalledWith("m1");
  });
  it("dismissing a stuck item dismisses the room attention", async () => {
    renderList([
      {
        ...base,
        reason: "stuck",
        taskStatus: "failed",
        proposalKind: null,
        proposalMessageId: null,
      },
    ]);
    await userEvent.click(screen.getByRole("button", { name: "Dismiss" }));
    expect(dismissRoomAttention).toHaveBeenCalledWith("r1");
  });
  it("finished items have Review and no Dismiss", () => {
    renderList([
      {
        ...base,
        reason: "finished",
        proposalKind: null,
        proposalMessageId: null,
      },
    ]);
    expect(screen.getByRole("link", { name: "Review" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Dismiss" })).toBeNull();
  });
  it("shows the caught-up state when nothing needs you", () => {
    renderList([]);
    expect(screen.getByText("You're all caught up")).toBeInTheDocument();
  });
});
