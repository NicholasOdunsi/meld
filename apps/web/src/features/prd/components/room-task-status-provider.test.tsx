// @vitest-environment jsdom

import {
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
} from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import { PrdTabContent } from "./prd-generating";
import { RoomTabStrip } from "./room-tab-strip";
import {
  RoomTaskStatusProvider,
  useRoomTaskStatus,
} from "./room-task-status-provider";

const routerMocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

const ROOM_ID = "40000000-0000-4000-8000-000000000001";

function prdStatus(
  status: RoomTaskStatus["status"],
): RoomTaskStatus {
  return {
    taskId: "70000000-0000-4000-8000-000000000001",
    sourceMessageId: null,
    initiatingUserId: "10000000-0000-4000-8000-000000000001",
    provider: "codex",
    kind: "prd_generate",
    status,
    createdAt: "2026-08-02T12:00:00.000Z",
    updatedAt: "2026-08-02T12:00:01.000Z",
  };
}

function QueuePrdButton() {
  const status = useRoomTaskStatus();
  return (
    <button
      type="button"
      onClick={() =>
        status?.notifyQueued({
          kind: "prd_generate",
          taskId: "70000000-0000-4000-8000-000000000001",
        })
      }
    >
      Queue PRD
    </button>
  );
}

afterEach(() => {
  cleanup();
  vi.useRealTimers();
});

beforeEach(() => {
  routerMocks.refresh.mockReset();
  routerMocks.push.mockReset();
});

describe("room-level PRD task status", () => {
  it("reveals the PRD tab immediately and renders generation inside it", () => {
    render(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
        hasPrd={false}
        fetchTaskStatuses={vi.fn().mockResolvedValue([])}
      >
        <QueuePrdButton />
        <RoomTabStrip
          activeTab="conversation"
          hasPrd={false}
          basePath="/o/discovery/r"
        />
        <PrdTabContent hasPrd={false} />
      </RoomTaskStatusProvider>,
    );

    expect(screen.queryByRole("link", { name: /PRD/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Queue PRD" }));

    expect(screen.getByRole("link", { name: /PRD/ })).toBeVisible();
    expect(screen.getByText("Drafting your PRD…")).toBeVisible();
  });

  it("keeps polling at room level and refreshes when generation settles", async () => {
    const fetchTaskStatuses = vi
      .fn()
      .mockResolvedValueOnce([prdStatus("running")])
      .mockResolvedValue([prdStatus("completed")]);

    const view = render(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
        hasPrd={false}
        fetchTaskStatuses={fetchTaskStatuses}
        taskPollIntervalMs={1}
      >
        <PrdTabContent hasPrd={false} />
      </RoomTaskStatusProvider>,
    );

    expect(await screen.findByText("Drafting your PRD…")).toBeVisible();
    await waitFor(() => expect(fetchTaskStatuses).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(routerMocks.refresh).toHaveBeenCalledOnce());
    expect(screen.getByText("Drafting your PRD…")).toBeVisible();

    view.rerender(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
        hasPrd
        fetchTaskStatuses={fetchTaskStatuses}
        taskPollIntervalMs={1}
      >
        <PrdTabContent hasPrd>
          <p>Materialized PRD</p>
        </PrdTabContent>
      </RoomTaskStatusProvider>,
    );
    expect(screen.getByText("Materialized PRD")).toBeVisible();
  });

  it("does not refresh for a historical completed task", async () => {
    const fetchTaskStatuses = vi
      .fn()
      .mockResolvedValue([prdStatus("completed")]);

    render(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
        hasPrd={false}
        fetchTaskStatuses={fetchTaskStatuses}
      >
        <PrdTabContent hasPrd={false} />
      </RoomTaskStatusProvider>,
    );

    expect(await screen.findByText("No PRD yet")).toBeVisible();
    expect(routerMocks.refresh).not.toHaveBeenCalled();
  });

  it("refreshes at most once for repeated completed emissions", async () => {
    const fetchTaskStatuses = vi
      .fn()
      .mockResolvedValueOnce([prdStatus("running")])
      .mockResolvedValue([prdStatus("completed")]);

    render(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
        hasPrd={false}
        fetchTaskStatuses={fetchTaskStatuses}
        taskPollIntervalMs={1}
      >
        <QueuePrdButton />
      </RoomTaskStatusProvider>,
    );

    await waitFor(() => expect(routerMocks.refresh).toHaveBeenCalledOnce());
    fireEvent.click(screen.getByRole("button", { name: "Queue PRD" }));
    await waitFor(() => expect(fetchTaskStatuses).toHaveBeenCalledTimes(3));
    expect(routerMocks.refresh).toHaveBeenCalledOnce();
  });

  it("surfaces a failed PRD with a retry that preserves its provider", async () => {
    const generatePrdAction = vi.fn().mockResolvedValue({
      status: "queued" as const,
      taskId: "70000000-0000-4000-8000-000000000002",
    });

    render(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
        hasPrd={false}
        fetchTaskStatuses={vi.fn().mockResolvedValue([prdStatus("failed")])}
      >
        <PrdTabContent
          hasPrd={false}
          roomId={ROOM_ID}
          organizationId="org-1"
          basePath="/org-1/discovery/room-1"
          generatePrdAction={generatePrdAction}
        />
      </RoomTaskStatusProvider>,
    );

    expect(await screen.findByText("The PRD could not be generated")).toBeVisible();
    fireEvent.click(screen.getByRole("button", { name: "Try again" }));
    await waitFor(() =>
      expect(generatePrdAction).toHaveBeenCalledWith({
        roomId: ROOM_ID,
        provider: "codex",
      }),
    );
  });

  it("routes a PRD authentication blocker to connection setup", async () => {
    render(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
        hasPrd={false}
        fetchTaskStatuses={vi
          .fn()
          .mockResolvedValue([prdStatus("needs_reauthentication")])}
      >
        <PrdTabContent
          hasPrd={false}
          roomId={ROOM_ID}
          organizationId="org-1"
          basePath="/org-1/discovery/room-1"
        />
      </RoomTaskStatusProvider>,
    );

    expect(await screen.findByText("Authentication required")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Fix connection" }),
    );
    expect(routerMocks.push).toHaveBeenCalledWith(
      `/org-1/settings/devices?returnTo=${encodeURIComponent(
        "/org-1/discovery/room-1?tab=prd",
      )}`,
    );
  });
});
