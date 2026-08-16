import { beforeEach, expect, it, vi } from "vitest";
import { subscribeToDesignEvents } from "./design-events-subscription";
import type { DesignScreenEvent } from "@meld/contracts";

const mocks = vi.hoisted(() => ({
  removeChannel: vi.fn(),
  channel: vi.fn(),
  subscribe: vi.fn(),
  setAuth: vi.fn(),
  listRoomDesignEvents: vi.fn(),
  onCalls: [] as Array<{
    type: string;
    event: string | undefined;
    filter: string | undefined;
    table: string | undefined;
  }>,
  subscribeCallbacks: [] as Array<(status: string) => void>,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: vi.fn(
        (
          type: string,
          config: { event?: string; filter?: string; table?: string },
        ) => {
          mocks.onCalls.push({
            type,
            event: config.event,
            filter: config.filter,
            table: config.table,
          });
          return channel;
        },
      ),
      subscribe: mocks.subscribe.mockImplementation(
        (callback?: (status: string) => void) => {
          if (callback) mocks.subscribeCallbacks.push(callback);
          return channel;
        },
      ),
    };
    return {
      channel: mocks.channel.mockReturnValue(channel),
      removeChannel: mocks.removeChannel,
      realtime: { setAuth: mocks.setAuth },
    };
  },
}));

vi.mock("./design-events-reader", () => ({
  listRoomDesignEvents: mocks.listRoomDesignEvents,
}));

const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const EVENT_ID = "50000000-0000-4000-8000-000000000005";
const SCREEN_ID = "60000000-0000-4000-8000-000000000006";

// The subscription awaits realtime auth before opening the channel, so the
// channel setup happens a microtask after the synchronous call returns.
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  mocks.removeChannel.mockReset();
  mocks.channel.mockReset();
  mocks.subscribe.mockReset();
  mocks.setAuth.mockReset().mockResolvedValue(undefined);
  mocks.listRoomDesignEvents.mockReset().mockResolvedValue([]);
  mocks.onCalls = [];
  mocks.subscribeCallbacks = [];
});

it("subscribes on a dedicated topic, not the shared private room topic", async () => {
  subscribeToDesignEvents(ROOM_ID, () => {});
  await flush();

  expect(mocks.channel).toHaveBeenCalledWith(`design-events:${ROOM_ID}`);
  // The shared `room:${roomId}` channel is owned by the broadcast
  // subscription. Adding postgres_changes to it after it has subscribed is
  // exactly what threw "cannot add postgres_changes ... after subscribe()".
  expect(mocks.channel).not.toHaveBeenCalledWith(
    `room:${ROOM_ID}`,
    expect.anything(),
  );
});

it("listens for design_screen_events inserts scoped to the room", async () => {
  subscribeToDesignEvents(ROOM_ID, () => {});
  await flush();

  expect(mocks.onCalls).toContainEqual({
    type: "postgres_changes",
    event: "INSERT",
    table: "design_screen_events",
    filter: `room_id=eq.${ROOM_ID}`,
  });
});

it("authenticates the realtime socket before subscribing", async () => {
  subscribeToDesignEvents(ROOM_ID, () => {});

  // Auth is awaited first: the channel must not be opened synchronously.
  expect(mocks.channel).not.toHaveBeenCalled();
  expect(mocks.setAuth).toHaveBeenCalledTimes(1);

  await flush();
  expect(mocks.channel).toHaveBeenCalledOnce();
  expect(mocks.setAuth.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.subscribe.mock.invocationCallOrder[0],
  );
});

it("maps a raw INSERT row (snake_case) to a parsed DesignScreenEvent", async () => {
  const onEvent = vi.fn();
  subscribeToDesignEvents(ROOM_ID, onEvent);
  await flush();

  const onCallback = mocks.channel.mock.results[0]?.value.on.mock
    .calls[0]?.[2] as (payload: { new: Record<string, unknown> }) => void;

  onCallback({
    new: {
      id: EVENT_ID,
      room_id: ROOM_ID,
      screen_id: SCREEN_ID,
      kind: "version_created",
      message_id: null,
      task_id: null,
      version_id: null,
      actor: null,
      created_at: "2026-08-14T10:00:00.000Z",
    },
  });

  expect(onEvent).toHaveBeenCalledWith({
    id: EVENT_ID,
    roomId: ROOM_ID,
    screenId: SCREEN_ID,
    kind: "version_created",
    messageId: null,
    taskId: null,
    versionId: null,
    actor: null,
    createdAt: "2026-08-14T10:00:00.000Z",
  } satisfies DesignScreenEvent);
});

it("drops a raw row that fails to parse", async () => {
  const onEvent = vi.fn();
  subscribeToDesignEvents(ROOM_ID, onEvent);
  await flush();

  const onCallback = mocks.channel.mock.results[0]?.value.on.mock
    .calls[0]?.[2] as (payload: { new: Record<string, unknown> }) => void;

  onCallback({
    new: {
      id: EVENT_ID,
      room_id: ROOM_ID,
      screen_id: SCREEN_ID,
      kind: "not-a-real-kind",
      message_id: null,
      task_id: null,
      version_id: null,
      actor: null,
      created_at: "2026-08-14T10:00:00.000Z",
    },
  });

  expect(onEvent).not.toHaveBeenCalled();
});

it("re-lists and reconciles design events on each SUBSCRIBED handshake", async () => {
  const recovered: DesignScreenEvent = {
    id: EVENT_ID,
    roomId: ROOM_ID,
    screenId: SCREEN_ID,
    kind: "restored",
    messageId: null,
    taskId: null,
    versionId: null,
    actor: null,
    createdAt: "2026-08-14T10:00:00.000Z",
  };
  mocks.listRoomDesignEvents.mockResolvedValue([recovered]);
  const onEvent = vi.fn();

  subscribeToDesignEvents(ROOM_ID, onEvent);
  await flush();

  // The handshake fires the recovery re-list, which reconciles what the
  // stream could not have delivered while the channel was down.
  mocks.subscribeCallbacks[0]?.("SUBSCRIBED");
  await flush();

  expect(mocks.listRoomDesignEvents).toHaveBeenCalledWith(ROOM_ID);
  expect(onEvent.mock.calls[0]?.[0]).toBe(recovered);
});

it("does not recover on a non-subscribed status", async () => {
  const onEvent = vi.fn();
  subscribeToDesignEvents(ROOM_ID, onEvent);
  await flush();

  mocks.subscribeCallbacks[0]?.("CHANNEL_ERROR");
  await flush();

  expect(mocks.listRoomDesignEvents).not.toHaveBeenCalled();
  expect(onEvent).not.toHaveBeenCalled();
});

it("removes the channel on teardown", async () => {
  const unsubscribe = subscribeToDesignEvents(ROOM_ID, () => {});
  await flush();
  unsubscribe();

  expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
});

it("never opens the channel when torn down before auth settles", async () => {
  const unsubscribe = subscribeToDesignEvents(ROOM_ID, () => {});
  // Tear down while realtime auth is still in flight.
  unsubscribe();
  await flush();

  expect(mocks.channel).not.toHaveBeenCalled();
  expect(mocks.removeChannel).not.toHaveBeenCalled();
});
