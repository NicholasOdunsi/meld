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
import { RoomTabStrip } from "@/features/rooms/components/room-tab-strip";
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
    agentKind: "product",
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

// A prd_generate notice only updates optimistic state -- it deliberately does
// not wake the poller itself (see room-task-status-provider.tsx), since that
// notice fires in the same tick as the client navigation to the PRD tab, and
// an immediate poll there can race and revert that navigation. The real wake
// happens once PrdGenerating actually mounts. This button stands in for that
// mount-time wake without needing a full PrdGenerating render.
function WakePollerButton() {
  const status = useRoomTaskStatus();
  return (
    <button type="button" onClick={() => status?.notifyQueued()}>
      Wake poller
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
          activeSurface="conversation"
          surfaceState={{
            hasUserFlow: false,
            hasPrd: false,
            hasPrdTask: false,
            decisionCount: 0,
          }}
          basePath="/o/rooms/r"
        />
        <PrdTabContent hasPrd={false} />
      </RoomTaskStatusProvider>,
    );

    expect(screen.queryByRole("link", { name: /PRD/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Queue PRD" }));

    expect(screen.getByRole("link", { name: /PRD/ })).toBeVisible();
    // No task row exists yet at this point -- only the optimistic notice
    // from QueuePrdButton -- so "Queued" is the honest state to claim.
    expect(screen.getByRole("status")).toHaveTextContent("Queued");
  });

  it("keeps polling at room level and refreshes when generation settles", async () => {
    // A real 1ms poll interval races the mock's automatic advance from
    // "running" to "completed" against RTL's async resolution: by the time
    // findByText's promise settles, a second poll may already have landed
    // and, with the honest AgentActivity label, already unmounted the text
    // this test wants to observe first. Gating on an explicit flag keeps
    // "running" stable until the test says otherwise, making the sequence
    // deterministic instead of racy.
    let hasSettled = false;
    const fetchTaskStatuses = vi.fn(async () =>
      hasSettled ? [prdStatus("completed")] : [prdStatus("running")],
    );

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

    expect(await screen.findByText("Drafting your PRD")).toBeVisible();

    hasSettled = true;
    await waitFor(() => expect(routerMocks.refresh).toHaveBeenCalledOnce());
    // The refresh above already implies a second poll landed, but this test
    // is named for the polling, so prove it directly rather than by
    // inference.
    expect(fetchTaskStatuses.mock.calls.length).toBeGreaterThanOrEqual(2);
    // Once the task has genuinely settled, AgentActivity honestly stops
    // claiming it's still drafting -- unlike the old hardcoded header, which
    // never depended on status and so never disappeared. The task is done
    // but the document itself hasn't materialized yet (hasPrd is still
    // false at this point), so the surface must say that honestly rather
    // than going blank while router.refresh() is in flight.
    expect(screen.queryByText("Drafting your PRD")).not.toBeInTheDocument();
    expect(screen.getByText("Loading your PRD")).toBeVisible();

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

  it("refreshes when an active initial PRD generation is cancelled", async () => {
    const fetchTaskStatuses = vi
      .fn()
      .mockResolvedValueOnce([prdStatus("running")])
      .mockResolvedValue([prdStatus("cancelled")]);

    render(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
        hasPrd={false}
        fetchTaskStatuses={fetchTaskStatuses}
        taskPollIntervalMs={1}
      >
        <PrdTabContent hasPrd={false} />
      </RoomTaskStatusProvider>,
    );

    await waitFor(() => expect(routerMocks.refresh).toHaveBeenCalledOnce());
    expect(fetchTaskStatuses.mock.calls.length).toBeGreaterThanOrEqual(2);
  });

  it("refreshes when the server-active PRD task is cancelled before the first poll", async () => {
    const fetchTaskStatuses = vi
      .fn()
      .mockResolvedValue([prdStatus("cancelled")]);

    render(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
        hasPrd={false}
        initialActivePrdTaskIds={[prdStatus("running").taskId]}
        fetchTaskStatuses={fetchTaskStatuses}
      >
        <PrdTabContent hasPrd={false} />
      </RoomTaskStatusProvider>,
    );

    await waitFor(() => expect(routerMocks.refresh).toHaveBeenCalledOnce());
    expect(fetchTaskStatuses).toHaveBeenCalledOnce();
  });

  it("does not refresh for a different cancelled PRD task", async () => {
    const fetchTaskStatuses = vi
      .fn()
      .mockResolvedValue([prdStatus("cancelled")]);

    render(
      <RoomTaskStatusProvider
        roomId={ROOM_ID}
        hasPrd={false}
        initialActivePrdTaskIds={["70000000-0000-4000-8000-000000000099"]}
        fetchTaskStatuses={fetchTaskStatuses}
      >
        <PrdTabContent hasPrd={false} />
      </RoomTaskStatusProvider>,
    );

    await waitFor(() => expect(fetchTaskStatuses).toHaveBeenCalledOnce());
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
        <WakePollerButton />
      </RoomTaskStatusProvider>,
    );

    await waitFor(() => expect(routerMocks.refresh).toHaveBeenCalledOnce());
    // A later wake for the same, already-settled task -- e.g. returning to
    // the PRD tab, which remounts PrdGenerating -- must not refresh again.
    fireEvent.click(screen.getByRole("button", { name: "Wake poller" }));
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
          workspaceId="org-1"
          basePath="/org-1/rooms/room-1"
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
          workspaceId="org-1"
          basePath="/org-1/rooms/room-1"
        />
      </RoomTaskStatusProvider>,
    );

    expect(await screen.findByText("Authentication required")).toBeVisible();
    fireEvent.click(
      screen.getByRole("button", { name: "Fix connection" }),
    );
    expect(routerMocks.push).toHaveBeenCalledWith(
      `/org-1/settings/devices?returnTo=${encodeURIComponent(
        "/org-1/rooms/room-1?tab=prd",
      )}`,
    );
  });
});
