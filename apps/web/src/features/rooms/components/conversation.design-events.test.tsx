// @vitest-environment jsdom

import { act, cleanup, render, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import type { AgentReadiness } from "@/features/ai/agent-readiness";
import type { RoomTaskStatus } from "@/features/ai/room-task-status";
import { RoomTaskStatusProvider } from "@/features/prd/components/room-task-status-provider";

vi.stubGlobal(
  "ResizeObserver",
  class {
    observe() {}
    unobserve() {}
    disconnect() {}
  },
);

const routerMocks = vi.hoisted(() => ({
  push: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => routerMocks,
}));

vi.mock("../proposals", () => ({
  listRoomProposalResponses: vi.fn().mockResolvedValue([]),
  acceptPrdMessageProposal: vi.fn(),
  dismissMessageProposal: vi.fn(),
  captureProposedDecision: vi.fn(),
  acceptProposedUserFlow: vi.fn(),
}));

const designMocks = vi.hoisted(() => ({
  listDesignAgentTurns: vi.fn().mockResolvedValue([]),
  subscribeToDesignEvents: vi.fn<
    (roomId: string, onEvent: () => void) => () => void
  >(() => () => undefined),
}));

vi.mock("@/features/design/design-agent-transcript", () => ({
  listDesignAgentTurns: designMocks.listDesignAgentTurns,
}));
vi.mock("@/features/design/design-screen-generation", () => ({
  generateDesignScreen: vi.fn(),
  getDesignScreenGeneration: vi.fn(),
}));
vi.mock("@/features/design/canvas-screen-action", () => ({
  getRoomCanvasScreens: vi.fn().mockResolvedValue({ ok: true, screens: [] }),
}));
vi.mock("@/features/design/design-profile-reader", () => ({
  getActiveDesignProfile: vi
    .fn()
    .mockResolvedValue({ status: "ok", hasActiveProfile: false, tokenCss: "" }),
}));
vi.mock("@/features/design/design-events-subscription", () => ({
  subscribeToDesignEvents: designMocks.subscribeToDesignEvents,
}));

import { Conversation } from "./conversation";

const roomId = "20000000-0000-4000-8000-000000000001";
const currentUserId = "10000000-0000-4000-8000-000000000001";
const NOT_READY: AgentReadiness = { ready: false, reason: "no_device" };

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function renderConversationWithTaskStatus() {
  // Every read hands back a fresh array, exactly as the server reader does.
  // The identity of that array is what used to invalidate the design-event
  // effect and rebuild its subscription.
  const fetchTaskStatuses = vi.fn(async (): Promise<RoomTaskStatus[]> => []);
  return render(
    <RoomTaskStatusProvider
      roomId={roomId}
      fetchTaskStatuses={fetchTaskStatuses}
    >
      <Conversation
        roomId={roomId}
        roomName="Customer interviews"
        currentUserId={currentUserId}
        currentUserName="Owner Example"
        initialMessages={[]}
        fetchReadiness={vi.fn().mockResolvedValue(NOT_READY)}
        fetchMessageAttachments={vi.fn().mockResolvedValue([])}
        subscribe={() => () => {}}
      />
    </RoomTaskStatusProvider>,
  );
}

function latestDesignEventHandler(): () => void {
  const calls = designMocks.subscribeToDesignEvents.mock.calls;
  const latest = calls[calls.length - 1];
  if (!latest) throw new Error("design events were never subscribed to");
  return latest[1];
}

it("keeps one design-event subscription when a task-status read lands", async () => {
  renderConversationWithTaskStatus();
  await waitFor(() =>
    expect(designMocks.subscribeToDesignEvents).toHaveBeenCalled(),
  );
  const subscriptionsBefore =
    designMocks.subscribeToDesignEvents.mock.calls.length;

  // Reacting to an event wakes the task poller, whose next read replaces the
  // statuses array. That must not tear the subscription down: re-subscribing
  // replays every stored event, which wakes the poller again -- the feedback
  // loop that kept the room refreshing forever.
  await act(async () => {
    latestDesignEventHandler()();
  });
  await waitFor(() => expect(routerMocks.refresh).toHaveBeenCalled());

  expect(designMocks.subscribeToDesignEvents.mock.calls.length).toBe(
    subscriptionsBefore,
  );
});

it("reacts once when a handshake replays the stored design events", async () => {
  renderConversationWithTaskStatus();
  await waitFor(() =>
    expect(designMocks.subscribeToDesignEvents).toHaveBeenCalled(),
  );
  routerMocks.refresh.mockClear();
  const handleDesignEvent = latestDesignEventHandler();

  // The subscription's recovery path replays the room's whole event history
  // in one synchronous pass on every handshake.
  await act(async () => {
    handleDesignEvent();
    handleDesignEvent();
    handleDesignEvent();
  });

  expect(routerMocks.refresh).toHaveBeenCalledTimes(1);
});
