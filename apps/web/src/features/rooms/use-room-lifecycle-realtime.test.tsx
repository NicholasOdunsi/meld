// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import type { RoomLifecycleSnapshot } from "./schemas";
import { useRoomLifecycleRealtime } from "./use-room-lifecycle-realtime";

type Status = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

const mocks = vi.hoisted(() => ({
  getSnapshot: vi.fn(),
  removeChannel: vi.fn(),
  channelNames: [] as string[],
  update: undefined as undefined | ((event: { new: unknown }) => void),
  insert: undefined as undefined | ((event: { new: unknown }) => void),
  status: undefined as undefined | ((status: Status) => void),
}));

vi.mock("./actions", () => ({
  getRoomLifecycleSnapshot: mocks.getSnapshot,
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: vi.fn(
        (
          _type: string,
          config: { event?: string },
          handler: (event: { new: unknown }) => void,
        ) => {
          if (config.event === "INSERT") {
            mocks.insert = handler;
          } else {
            mocks.update = handler;
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
      channel: vi.fn((name: string) => {
        mocks.channelNames.push(name);
        return channel;
      }),
      removeChannel: mocks.removeChannel,
    };
  },
}));

const ROOM_ID = "40000000-0000-4000-8000-000000000004";
const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const PROJECT_ID = "70000000-0000-4000-8000-000000000007";
const initialRoom: RoomLifecycleSnapshot = {
  id: ROOM_ID,
  workspaceId: WORKSPACE_ID,
  projectId: PROJECT_ID,
  name: "Interviews",
  ownerId: OWNER_ID,
  stage: "discovery",
  updatedAt: "2026-08-11T10:00:00.000Z",
};

function snapshot(
  overrides: Partial<RoomLifecycleSnapshot> = {},
): RoomLifecycleSnapshot {
  return { ...initialRoom, ...overrides };
}

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: ROOM_ID,
    workspace_id: WORKSPACE_ID,
    project_id: PROJECT_ID,
    name: "Interviews",
    owner_id: OWNER_ID,
    stage: "design",
    created_at: "2026-08-11T10:00:00.000Z",
    updated_at: "2026-08-11T10:01:00.000Z",
    ...overrides,
  };
}

function deferred<T>() {
  let resolve: (value: T) => void = () => undefined;
  const promise = new Promise<T>((resolvePromise) => {
    resolve = resolvePromise;
  });
  return { promise, resolve };
}

beforeEach(() => {
  mocks.getSnapshot.mockReset();
  mocks.getSnapshot.mockResolvedValue([initialRoom]);
  mocks.removeChannel.mockReset();
  mocks.channelNames = [];
  mocks.update = undefined;
  mocks.insert = undefined;
  mocks.status = undefined;
});

// Two consumers scoped to the same room (the room header and the stage panel)
// must not share a channel: Supabase caches channels by topic, and adding an
// `.on()` to an already-`subscribe()`d channel throws
// "cannot add `postgres_changes` callbacks ... after `subscribe()`".
it("opens a distinct channel per hook instance for the same room", () => {
  renderHook(() => useRoomLifecycleRealtime({ roomId: ROOM_ID }, [initialRoom]));
  renderHook(() => useRoomLifecycleRealtime({ roomId: ROOM_ID }, [initialRoom]));
  expect(mocks.channelNames).toHaveLength(2);
  expect(mocks.channelNames[0]).not.toBe(mocks.channelNames[1]);
  for (const name of mocks.channelNames) {
    expect(name).toContain(`room-lifecycle:room:${ROOM_ID}`);
  }
});

it("replaces stage and project from a complete room update", async () => {
  const { result } = renderHook(() =>
    useRoomLifecycleRealtime({ roomId: ROOM_ID }, [initialRoom]),
  );
  act(() => mocks.status?.("SUBSCRIBED"));
  act(() => mocks.update?.({ new: row({ project_id: crypto.randomUUID() }) }));
  await waitFor(() => expect(result.current[0].stage).toBe("design"));
  expect(result.current[0].projectId).not.toBe(PROJECT_ID);
});

it("ignores a partial room update instead of replacing authoritative state", () => {
  const { result } = renderHook(() =>
    useRoomLifecycleRealtime({ roomId: ROOM_ID }, [initialRoom]),
  );
  act(() => mocks.status?.("SUBSCRIBED"));
  act(() => mocks.update?.({ new: { id: ROOM_ID, stage: "design" } }));
  expect(result.current[0]).toEqual(initialRoom);
});

it("awaits a snapshot after an initial timeout and replays a concurrent update", async () => {
  const pending = deferred<RoomLifecycleSnapshot[]>();
  mocks.getSnapshot.mockReturnValue(pending.promise);
  const { result } = renderHook(() =>
    useRoomLifecycleRealtime({ workspaceId: WORKSPACE_ID }, [initialRoom]),
  );

  act(() => mocks.status?.("TIMED_OUT"));
  act(() => mocks.status?.("SUBSCRIBED"));
  expect(mocks.getSnapshot).toHaveBeenCalledWith({ workspaceId: WORKSPACE_ID });
  act(() =>
    mocks.update?.({
      new: row({
        stage: "development",
        updated_at: "2026-08-11T10:03:00.000Z",
      }),
    }),
  );
  expect(result.current[0].stage).toBe("discovery");

  await act(async () => {
    pending.resolve([
      snapshot({ stage: "define", updatedAt: "2026-08-11T10:02:00.000Z" }),
    ]);
    await pending.promise;
  });
  await waitFor(() => expect(result.current[0].stage).toBe("development"));
});

it("does not let a stale buffered event overwrite the authoritative snapshot", async () => {
  const pending = deferred<RoomLifecycleSnapshot[]>();
  mocks.getSnapshot.mockReturnValue(pending.promise);
  const { result } = renderHook(() =>
    useRoomLifecycleRealtime({ roomId: ROOM_ID }, [initialRoom]),
  );
  act(() => mocks.status?.("SUBSCRIBED"));
  act(() => mocks.status?.("CHANNEL_ERROR"));
  act(() => mocks.status?.("SUBSCRIBED"));
  act(() =>
    mocks.update?.({
      new: row({ updated_at: "2026-08-11T10:01:00.000Z" }),
    }),
  );

  await act(async () => {
    pending.resolve([
      snapshot({
        stage: "development",
        updatedAt: "2026-08-11T10:02:00.000Z",
      }),
    ]);
    await pending.promise;
  });
  await waitFor(() => expect(result.current[0].stage).toBe("development"));
});

it("adds a newly created workspace room without a manual refresh", async () => {
  const newRoomId = "50000000-0000-4000-8000-000000000005";
  const { result } = renderHook(() =>
    useRoomLifecycleRealtime({ workspaceId: WORKSPACE_ID }, [initialRoom]),
  );
  act(() => mocks.status?.("SUBSCRIBED"));

  // The INSERT event only carries the raw row; the authoritative list is the
  // source of truth, so the hook re-reads the full workspace snapshot.
  mocks.getSnapshot.mockResolvedValue([
    initialRoom,
    snapshot({ id: newRoomId, name: "Kickoff" }),
  ]);
  act(() =>
    mocks.insert?.({ new: row({ id: newRoomId, name: "Kickoff" }) }),
  );

  await waitFor(() => expect(result.current).toHaveLength(2));
  expect(result.current.map((room) => room.id)).toContain(newRoomId);
});

it("installs a snapshot equal to the original props after a local change", async () => {
  const { result } = renderHook(() =>
    useRoomLifecycleRealtime({ roomId: ROOM_ID }, [initialRoom]),
  );
  act(() => mocks.status?.("SUBSCRIBED"));
  act(() => mocks.update?.({ new: row() }));
  await waitFor(() => expect(result.current[0].stage).toBe("design"));

  mocks.getSnapshot.mockResolvedValue([
    snapshot({ updatedAt: "2026-08-11T10:02:00.000Z" }),
  ]);
  act(() => mocks.status?.("CLOSED"));
  act(() => mocks.status?.("SUBSCRIBED"));
  await waitFor(() => expect(result.current[0].stage).toBe("discovery"));
});
