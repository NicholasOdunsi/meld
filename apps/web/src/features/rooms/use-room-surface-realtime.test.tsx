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
  push: vi.fn(),
  removeChannel: vi.fn(),
  channel: vi.fn(),
  status: undefined as undefined | ((status: Status) => void),
  broadcast: undefined as undefined | ChangeHandler,
  roomDeleted: undefined as undefined | ChangeHandler,
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({
    refresh: mocks.refresh,
    replace: mocks.replace,
    push: mocks.push,
  }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: vi.fn(
        (
          _type: string,
          config: { event: string },
          handler: ChangeHandler,
        ) => {
          if (config.event === "room-deleted") {
            mocks.roomDeleted = handler;
          } else {
            mocks.broadcast = handler;
          }
          return channel;
        },
      ),
      subscribe: vi.fn((handler: (status: Status) => void) => {
        mocks.status = handler;
        return channel;
      }),
    };
    return {
      channel: mocks.channel.mockReturnValue(channel),
      removeChannel: mocks.removeChannel,
    };
  },
}));

const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";

beforeEach(() => {
  vi.useFakeTimers();
  mocks.refresh.mockReset();
  mocks.replace.mockReset();
  mocks.push.mockReset();
  mocks.removeChannel.mockReset();
  mocks.channel.mockReset();
  mocks.status = undefined;
  mocks.broadcast = undefined;
  mocks.roomDeleted = undefined;
});

afterEach(() => {
  vi.useRealTimers();
});

it("subscribes to authenticated invalidation on the private Room topic", () => {
  renderHook(() => useRoomSurfaceRealtime(ROOM_ID, WORKSPACE_ID));

  expect(mocks.channel).toHaveBeenCalledWith(`room:${ROOM_ID}`, {
    config: { private: true },
  });
  expect(mocks.broadcast).toBeTypeOf("function");
});

it("debounces simultaneous surface changes into one authoritative refresh", () => {
  renderHook(() => useRoomSurfaceRealtime(ROOM_ID, WORKSPACE_ID));
  act(() => mocks.status?.("SUBSCRIBED"));
  act(() => {
    mocks.broadcast?.();
    mocks.broadcast?.();
    vi.runAllTimers();
  });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});

it("recovers an event in the query-to-subscription gap on the initial handshake", () => {
  renderHook(() => useRoomSurfaceRealtime(ROOM_ID, WORKSPACE_ID));

  act(() => mocks.broadcast?.());
  act(() => vi.runAllTimers());
  expect(mocks.refresh).not.toHaveBeenCalled();

  act(() => mocks.status?.("SUBSCRIBED"));
  act(() => {
    mocks.broadcast?.();
    vi.runAllTimers();
  });
  expect(mocks.refresh).toHaveBeenCalledTimes(1);

  act(() => mocks.status?.("SUBSCRIBED"));
  act(() => vi.runAllTimers());
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
});

it("refreshes once after reconnect", () => {
  renderHook(() => useRoomSurfaceRealtime(ROOM_ID, WORKSPACE_ID));
  act(() => mocks.status?.("SUBSCRIBED"));
  act(() => vi.runAllTimers());
  expect(mocks.refresh).toHaveBeenCalledTimes(1);

  act(() => mocks.status?.("CHANNEL_ERROR"));
  act(() => mocks.broadcast?.());
  act(() => vi.runAllTimers());
  expect(mocks.refresh).toHaveBeenCalledTimes(1);

  act(() => mocks.status?.("SUBSCRIBED"));
  act(() => vi.runAllTimers());
  expect(mocks.refresh).toHaveBeenCalledTimes(2);

  act(() => {
    mocks.broadcast?.();
    vi.runAllTimers();
  });
  expect(mocks.refresh).toHaveBeenCalledTimes(3);
});

it("does not leave a pending refresh after unmount", () => {
  const { unmount } = renderHook(() => useRoomSurfaceRealtime(ROOM_ID, WORKSPACE_ID));
  act(() => mocks.status?.("SUBSCRIBED"));
  act(() => mocks.broadcast?.());
  unmount();
  act(() => vi.runAllTimers());

  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
});

it("leaves the room for the workspace when it is deleted", () => {
  renderHook(() => useRoomSurfaceRealtime(ROOM_ID, WORKSPACE_ID));

  act(() => mocks.roomDeleted?.());

  expect(mocks.push).toHaveBeenCalledWith(`/${WORKSPACE_ID}`);
});

it("does not navigate on deletion after unmount", () => {
  const { unmount } = renderHook(() =>
    useRoomSurfaceRealtime(ROOM_ID, WORKSPACE_ID),
  );
  unmount();

  act(() => mocks.roomDeleted?.());

  expect(mocks.push).not.toHaveBeenCalled();
});

it("replaces an unavailable selection with the canonical Conversation URL", () => {
  render(
    <RoomSurfaceSync
      roomId={ROOM_ID}
      workspaceId={WORKSPACE_ID}
      replacementHref={`/workspace/rooms/${ROOM_ID}?tab=conversation`}
      realtimeEnabled
    />,
  );

  expect(mocks.replace).toHaveBeenCalledWith(
    `/workspace/rooms/${ROOM_ID}?tab=conversation`,
  );
  expect(mocks.refresh).not.toHaveBeenCalled();
  expect(mocks.channel).not.toHaveBeenCalled();
});
