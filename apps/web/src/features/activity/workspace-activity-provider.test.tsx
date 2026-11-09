// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomActivity } from "@meld/contracts";

const getWorkspaceActivity = vi.fn();
vi.mock("./actions", () => ({ getWorkspaceActivity: (id: string) => getWorkspaceActivity(id) }));

import {
  ACTIVITY_POLL_HIDDEN_MS,
  ACTIVITY_POLL_VISIBLE_MS,
  WorkspaceActivityProvider,
  useWorkspaceActivity,
} from "./workspace-activity-provider";

const working: RoomActivity = {
  roomId: "r1",
  projectId: "p1",
  roomName: "Tab",
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

function Probe() {
  const { byProject } = useWorkspaceActivity();
  return <output>{byProject.get("p1")?.state ?? "none"}</output>;
}

function setVisibility(value: "visible" | "hidden") {
  Object.defineProperty(document, "visibilityState", { configurable: true, value });
  document.dispatchEvent(new Event("visibilitychange"));
}

beforeEach(() => {
  vi.useFakeTimers();
  getWorkspaceActivity.mockReset();
  setVisibility("visible");
});
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

describe("WorkspaceActivityProvider", () => {
  it("renders the initial snapshot", () => {
    render(
      <WorkspaceActivityProvider workspaceId="ws" initial={[working]}>
        <Probe />
      </WorkspaceActivityProvider>,
    );
    expect(screen.getByRole("status")).toHaveTextContent("working");
  });

  it("polls every 5s while visible", async () => {
    getWorkspaceActivity.mockResolvedValue([{ ...working, state: "idle" }]);
    render(
      <WorkspaceActivityProvider workspaceId="ws" initial={[working]}>
        <Probe />
      </WorkspaceActivityProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_VISIBLE_MS);
    });
    expect(getWorkspaceActivity).toHaveBeenCalledWith("ws");
    expect(screen.getByRole("status")).toHaveTextContent("idle");
  });

  it("slows to 30s when hidden", async () => {
    getWorkspaceActivity.mockResolvedValue([working]);
    render(
      <WorkspaceActivityProvider workspaceId="ws" initial={[working]}>
        <Probe />
      </WorkspaceActivityProvider>,
    );
    act(() => setVisibility("hidden"));
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_VISIBLE_MS);
    });
    expect(getWorkspaceActivity).not.toHaveBeenCalled();
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_HIDDEN_MS);
    });
    expect(getWorkspaceActivity).toHaveBeenCalledTimes(1);
  });

  it("keeps the last good value when a poll fails", async () => {
    getWorkspaceActivity.mockRejectedValue(new Error("offline"));
    render(
      <WorkspaceActivityProvider workspaceId="ws" initial={[working]}>
        <Probe />
      </WorkspaceActivityProvider>,
    );
    await act(async () => {
      await vi.advanceTimersByTimeAsync(ACTIVITY_POLL_VISIBLE_MS);
    });
    expect(screen.getByRole("status")).toHaveTextContent("working");
  });

  it("is idle outside a provider", () => {
    render(<Probe />);
    expect(screen.getByRole("status")).toHaveTextContent("none");
  });
});
