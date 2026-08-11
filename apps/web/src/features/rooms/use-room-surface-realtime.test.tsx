// @vitest-environment jsdom

import { act, render, renderHook } from "@testing-library/react";
import { afterEach, beforeEach, expect, it, vi } from "vitest";
import {
  RoomSurfaceSync,
  useRoomSurfaceRealtime,
} from "./use-room-surface-realtime";

type Status = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";
type ChangeHandler = () => void;

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  replace: vi.fn(),
  removeChannel: vi.fn(),
  status: undefined as undefined | ((status: Status) => void),
  changes: [] as Array<{
    config: { event: string; table: string; filter: string };
    handler: ChangeHandler;
  }>,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: vi.fn(
        (
          _type: string,
          config: { event: string; table: string; filter: string },
          handler: ChangeHandler,
        ) => {
          mocks.changes.push({ config, handler });
          return channel;
        },
      ),
      subscribe: vi.fn((handler: (status: Status) => void) => {
        mocks.status = handler;
        return channel;
      }),
    };
    return {
      channel: vi.fn(() => channel),
      removeChannel: mocks.removeChannel,
    };
  },
}));

const ROOM_ID = "40000000-0000-4000-8000-000000000004";

beforeEach(() => {
  vi.useFakeTimers();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();
  mocks.removeChannel.mockReset();
  mocks.status = undefined;
  mocks.changes = [];
});

afterEach(() => {
  vi.useRealTimers();
});

it("subscribes only to Room-scoped surface metadata inserts and deletes", () => {
  renderHook(() => useRoomSurfaceRealtime(ROOM_ID));

  expect(mocks.changes.map(({ config }) => config)).toEqual([
    {
      event: "INSERT",
      schema: "public",
      table: "user_flows",
      filter: `room_id=eq.${ROOM_ID}`,
    },
    {
      event: "DELETE",
      schema: "public",
      table: "user_flows",
      filter: `room_id=eq.${ROOM_ID}`,
    },
    {
      event: "INSERT",
      schema: "public",
      table: "decisions",
      filter: `room_id=eq.${ROOM_ID}`,
    },
    {
      event: "DELETE",
      schema: "public",
      table: "decisions",
      filter: `room_id=eq.${ROOM_ID}`,
    },
  ]);
});

it("debounces simultaneous surface changes into one authoritative refresh", () => {
  renderHook(() => useRoomSurfaceRealtime(ROOM_ID));
  act(() => mocks.status?.("SUBSCRIBED"));
  mocks.refresh.mockReset();
  act(() => {
    mocks.changes[0]?.handler();
    mocks.changes[2]?.handler();
    vi.runAllTimers();
  });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});

it("refreshes on the initial handshake and once on reconnect", () => {
  renderHook(() => useRoomSurfaceRealtime(ROOM_ID));
  act(() => mocks.status?.("SUBSCRIBED"));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);

  act(() => mocks.status?.("CHANNEL_ERROR"));
  act(() => mocks.changes[3]?.handler());
  act(() => vi.runAllTimers());
  expect(mocks.refresh).toHaveBeenCalledTimes(1);

  act(() => mocks.status?.("SUBSCRIBED"));
  expect(mocks.refresh).toHaveBeenCalledTimes(2);

  act(() => {
    mocks.changes[1]?.handler();
    vi.runAllTimers();
  });
  expect(mocks.refresh).toHaveBeenCalledTimes(3);
});

it("does not leave a pending refresh after unmount", () => {
  const { unmount } = renderHook(() => useRoomSurfaceRealtime(ROOM_ID));
  act(() => mocks.status?.("SUBSCRIBED"));
  mocks.refresh.mockReset();
  act(() => mocks.changes[0]?.handler());
  unmount();
  act(() => vi.runAllTimers());

  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
});

it("replaces an unavailable selection with the canonical Conversation URL", () => {
  render(
    <RoomSurfaceSync
      roomId={ROOM_ID}
      replacementHref={`/workspace/rooms/${ROOM_ID}?tab=conversation`}
      realtimeEnabled
    />,
  );

  expect(mocks.replace).toHaveBeenCalledWith(
    `/workspace/rooms/${ROOM_ID}?tab=conversation`,
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.changes).toHaveLength(0);
});
