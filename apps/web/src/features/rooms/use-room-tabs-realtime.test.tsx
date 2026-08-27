// @vitest-environment jsdom

import { act, renderHook } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { RoomTab } from "./room-tabs-repository";
import { useRoomTabsRealtime } from "./use-room-tabs-realtime";

type Payload = { new?: unknown; old?: unknown };
type ChangeHandler = (payload: Payload) => void;

const mocks = vi.hoisted(() => ({
  channel: vi.fn(),
  removeChannel: vi.fn(),
  handlers: {} as Record<string, ChangeHandler | undefined>,
  subscriptions: [] as Array<(status: string) => void>,
  registrations: [] as Array<{
    type: string;
    event: string | undefined;
    schema: string | undefined;
    table: string | undefined;
    filter: string | undefined;
  }>,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: vi.fn(
        (
          type: string,
          config: {
            event?: string;
            schema?: string;
            table?: string;
            filter?: string;
          },
          handler: ChangeHandler,
        ) => {
          mocks.registrations.push({
            type,
            event: config.event,
            schema: config.schema,
            table: config.table,
            filter: config.filter,
          });
          if (config.event) mocks.handlers[config.event] = handler;
          return channel;
        },
      ),
      subscribe: vi.fn((callback?: (status: string) => void) => {
        if (callback) mocks.subscriptions.push(callback);
        return channel;
      }),
    };

    mocks.channel.mockReturnValue(channel);
    return {
      channel: mocks.channel,
      removeChannel: mocks.removeChannel,
    };
  },
}));

const ROOM_ID = "40000000-0000-4000-8000-000000000004";

function tab(overrides: Partial<RoomTab> = {}): RoomTab {
  return {
    id: "tab-a",
    name: "Alpha",
    position: 0,
    panes: [],
    ...overrides,
  };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "tab-a",
    name: "Alpha",
    position: 0,
    panes: [],
    ...overrides,
  };
}

beforeEach(() => {
  mocks.channel.mockReset();
  mocks.removeChannel.mockReset();
  mocks.handlers = {};
  mocks.subscriptions = [];
  mocks.registrations = [];
});

it("subscribes privately to room_tabs and inserts tabs in position/id order", () => {
  const { result } = renderHook(() =>
    useRoomTabsRealtime({
      roomId: ROOM_ID,
      initialTabs: [tab({ id: "tab-z", position: 3 })],
    }),
  );

  expect(mocks.channel).toHaveBeenCalledWith(`room:${ROOM_ID}`, {
    config: { private: true },
  });
  expect(mocks.registrations).toEqual([
    {
      type: "postgres_changes",
      event: "INSERT",
      schema: "public",
      table: "room_tabs",
      filter: `room_id=eq.${ROOM_ID}`,
    },
    {
      type: "postgres_changes",
      event: "UPDATE",
      schema: "public",
      table: "room_tabs",
      filter: `room_id=eq.${ROOM_ID}`,
    },
    {
      type: "postgres_changes",
      event: "DELETE",
      schema: "public",
      table: "room_tabs",
      filter: `room_id=eq.${ROOM_ID}`,
    },
  ]);

  act(() => {
    mocks.handlers.INSERT?.({
      new: row({ id: "tab-b", name: "Beta", position: 1 }),
    });
    mocks.handlers.INSERT?.({
      new: row({ id: "tab-a", name: "Aardvark", position: 1 }),
    });
  });

  expect(result.current.map(({ id, position }) => ({ id, position }))).toEqual([
    { id: "tab-a", position: 1 },
    { id: "tab-b", position: 1 },
    { id: "tab-z", position: 3 },
  ]);
});

it("updates an existing tab in place, including its panes", () => {
  const { result } = renderHook(() =>
    useRoomTabsRealtime({
      roomId: ROOM_ID,
      initialTabs: [
        tab({ id: "tab-a", position: 0 }),
        tab({ id: "tab-b", name: "Beta", position: 1 }),
      ],
    }),
  );

  act(() => {
    mocks.handlers.UPDATE?.({
      new: row({
        id: "tab-a",
        name: "Renamed",
        position: 9,
        panes: ["prototype", "prd"],
      }),
    });
  });

  expect(result.current).toEqual([
    {
      id: "tab-a",
      name: "Renamed",
      position: 9,
      panes: ["prototype", "prd"],
    },
    tab({ id: "tab-b", name: "Beta", position: 1 }),
  ]);
});

it("deletes a tab by its old row id", () => {
  const { result } = renderHook(() =>
    useRoomTabsRealtime({
      roomId: ROOM_ID,
      initialTabs: [
        tab({ id: "tab-a" }),
        tab({ id: "tab-b", name: "Beta", position: 1 }),
      ],
    }),
  );

  act(() => mocks.handlers.DELETE?.({ old: { id: "tab-a" } }));

  expect(result.current).toEqual([
    tab({ id: "tab-b", name: "Beta", position: 1 }),
  ]);
});

it("removes the channel when the hook unmounts", () => {
  const { unmount } = renderHook(() =>
    useRoomTabsRealtime({ roomId: ROOM_ID, initialTabs: [] }),
  );

  unmount();

  expect(mocks.removeChannel).toHaveBeenCalledTimes(1);
});

it("ignores malformed payloads without throwing", () => {
  const initialTabs = [tab()];
  const { result } = renderHook(() =>
    useRoomTabsRealtime({ roomId: ROOM_ID, initialTabs }),
  );

  expect(() => {
    act(() => {
      mocks.handlers.INSERT?.({ new: { id: "broken" } });
      mocks.handlers.UPDATE?.({ new: null });
      mocks.handlers.DELETE?.({ old: { id: 42 } });
    });
  }).not.toThrow();
  expect(result.current).toEqual(initialTabs);
});

it("does not create a Supabase channel when realtime is disabled", () => {
  const { result } = renderHook(() =>
    useRoomTabsRealtime({
      roomId: ROOM_ID,
      initialTabs: [tab()],
      enabled: false,
    }),
  );

  expect(result.current).toEqual([tab()]);
  expect(mocks.channel).not.toHaveBeenCalled();
});
