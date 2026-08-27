import { beforeEach, expect, it, vi } from "vitest";
import { subscribeToProductionRoom } from "./room-message-subscription";
import type { RoomMessage } from "./repository";

const mocks = vi.hoisted(() => ({
  removeChannel: vi.fn(),
  channel: vi.fn(),
  subscribe: vi.fn(),
  setAuth: vi.fn(),
  listRoomMessages: vi.fn(),
  onCalls: [] as Array<{ type: string; event: string | undefined }>,
  subscribeCallbacks: [] as Array<(status: string) => void>,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: vi.fn((type: string, config: { event?: string }) => {
        mocks.onCalls.push({ type, event: config.event });
        return channel;
      }),
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

vi.mock("./actions", () => ({
  listRoomMessages: mocks.listRoomMessages,
}));

const ROOM_ID = "40000000-0000-4000-8000-000000000004";

// The subscription now awaits realtime auth before opening the channel, so the
// channel setup happens a microtask after the synchronous call returns.
function flush() {
  return new Promise((resolve) => setTimeout(resolve, 0));
}

beforeEach(() => {
  mocks.removeChannel.mockReset();
  mocks.channel.mockReset();
  mocks.subscribe.mockReset();
  mocks.setAuth.mockReset().mockResolvedValue(undefined);
  mocks.listRoomMessages.mockReset().mockResolvedValue([]);
  mocks.onCalls = [];
  mocks.subscribeCallbacks = [];
});

it("subscribes on a dedicated topic, not the shared private room topic", async () => {
  subscribeToProductionRoom(ROOM_ID, () => {});
  await flush();

  expect(mocks.channel).toHaveBeenCalledWith(`room-messages:${ROOM_ID}`);
  // The shared `room:${roomId}` channel is owned by the broadcast
  // subscription. Adding postgres_changes to it after it has subscribed is
  // exactly what threw "cannot add postgres_changes ... after subscribe()".
  expect(mocks.channel).not.toHaveBeenCalledWith(
    `room:${ROOM_ID}`,
    expect.anything(),
  );
});

it("listens for message inserts and updates without a room-deleted broadcast", async () => {
  subscribeToProductionRoom(ROOM_ID, () => {});
  await flush();

  expect(mocks.onCalls).toContainEqual({
    type: "postgres_changes",
    event: "INSERT",
  });
  expect(mocks.onCalls).toContainEqual({
    type: "postgres_changes",
    event: "UPDATE",
  });
  expect(mocks.onCalls.some((call) => call.type === "broadcast")).toBe(false);
});

it("authenticates the realtime socket before subscribing", async () => {
  subscribeToProductionRoom(ROOM_ID, () => {});

  // Auth is awaited first: the channel must not be opened synchronously.
  expect(mocks.channel).not.toHaveBeenCalled();
  expect(mocks.setAuth).toHaveBeenCalledTimes(1);

  await flush();
  expect(mocks.channel).toHaveBeenCalledOnce();
  expect(mocks.setAuth.mock.invocationCallOrder[0]).toBeLessThan(
    mocks.subscribe.mock.invocationCallOrder[0],
  );
});

it("re-lists and reconciles messages on each SUBSCRIBED handshake", async () => {
  const recovered = { id: "m1", clientId: "c1" } as unknown as RoomMessage;
  mocks.listRoomMessages.mockResolvedValue([recovered]);
  const onMessage = vi.fn();

  subscribeToProductionRoom(ROOM_ID, onMessage);
  await flush();

  // The handshake fires the recovery re-list, which reconciles what the stream
  // could not have delivered while the channel was down.
  mocks.subscribeCallbacks[0]?.("SUBSCRIBED");
  await flush();

  expect(mocks.listRoomMessages).toHaveBeenCalledWith(ROOM_ID);
  // forEach passes (message, index, array); the handler only reads the first.
  expect(onMessage.mock.calls[0]?.[0]).toBe(recovered);
});

it("does not recover on a non-subscribed status", async () => {
  const onMessage = vi.fn();
  subscribeToProductionRoom(ROOM_ID, onMessage);
  await flush();

  mocks.subscribeCallbacks[0]?.("CHANNEL_ERROR");
  await flush();

  expect(mocks.listRoomMessages).not.toHaveBeenCalled();
  expect(onMessage).not.toHaveBeenCalled();
});

it("removes the channel on teardown", async () => {
  const unsubscribe = subscribeToProductionRoom(ROOM_ID, () => {});
  await flush();
  unsubscribe();

  expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
});

it("never opens the channel when torn down before auth settles", async () => {
  const unsubscribe = subscribeToProductionRoom(ROOM_ID, () => {});
  // Tear down while realtime auth is still in flight.
  unsubscribe();
  await flush();

  expect(mocks.channel).not.toHaveBeenCalled();
  expect(mocks.removeChannel).not.toHaveBeenCalled();
});
