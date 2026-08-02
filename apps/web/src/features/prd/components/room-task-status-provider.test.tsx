// @vitest-environment jsdom

import { fireEvent, render, screen, waitFor } from "@testing-library/react";
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

afterEach(() => vi.useRealTimers());

beforeEach(() => {
  routerMocks.refresh.mockReset();
});

describe("room-level PRD task status", () => {
  it("reveals the PRD tab immediately and renders generation inside it", () => {
    render(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
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
      .mockResolvedValueOnce([prdStatus("completed")]);

    render(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
        fetchTaskStatuses={fetchTaskStatuses}
        taskPollIntervalMs={1}
      >
        <PrdTabContent hasPrd={false} />
      </RoomTaskStatusProvider>,
    );

    expect(await screen.findByText("Drafting your PRD…")).toBeVisible();
    await waitFor(() => expect(fetchTaskStatuses).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(routerMocks.refresh).toHaveBeenCalledOnce());
  });
});
