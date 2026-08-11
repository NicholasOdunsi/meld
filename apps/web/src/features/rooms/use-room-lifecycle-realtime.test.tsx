// @vitest-environment jsdom

import { act, renderHook, waitFor } from "@testing-library/react";
import { beforeEach, expect, it, vi } from "vitest";
import { useRoomLifecycleRealtime } from "./use-room-lifecycle-realtime";

type Status = "SUBSCRIBED" | "CHANNEL_ERROR" | "TIMED_OUT" | "CLOSED";

const mocks = vi.hoisted(() => ({
  refresh: vi.fn(),
  removeChannel: vi.fn(),
  update: undefined as undefined | ((event: { new: unknown }) => void),
  status: undefined as undefined | ((status: Status) => void),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: mocks.refresh }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => {
    const channel = {
      on: vi.fn(
        (_type: string, _config: unknown, handler: (event: { new: unknown }) => void) => {
          mocks.update = handler;
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
const WORKSPACE_ID = "30000000-0000-4000-8000-000000000003";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const PROJECT_ID = "70000000-0000-4000-8000-000000000007";
const initialRoom = {
  id: ROOM_ID,
  workspaceId: WORKSPACE_ID,
  projectId: PROJECT_ID,
  name: "Interviews",
  ownerId: OWNER_ID,
  stage: "discovery" as const,
};

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

beforeEach(() => {
  mocks.refresh.mockReset();
  mocks.removeChannel.mockReset();
  mocks.update = undefined;
  mocks.status = undefined;
});

it("replaces stage and project from a complete room update", async () => {
  const { result } = renderHook(() =>
    useRoomLifecycleRealtime({ roomId: ROOM_ID }, [initialRoom]),
  );
  act(() => mocks.update?.({ new: row({ project_id: crypto.randomUUID() }) }));
  await waitFor(() => expect(result.current[0].stage).toBe("design"));
  expect(result.current[0].projectId).not.toBe(PROJECT_ID);
});

it("ignores a partial room update instead of replacing authoritative state", () => {
  const { result } = renderHook(() =>
    useRoomLifecycleRealtime({ roomId: ROOM_ID }, [initialRoom]),
  );
  act(() => mocks.update?.({ new: { id: ROOM_ID, stage: "design" } }));
  expect(result.current[0]).toEqual(initialRoom);
});

it("refreshes once on reconnect before accepting subsequent updates", async () => {
  const { result } = renderHook(() =>
    useRoomLifecycleRealtime({ workspaceId: WORKSPACE_ID }, [initialRoom]),
  );
  act(() => mocks.status?.("SUBSCRIBED"));
  act(() => mocks.status?.("CHANNEL_ERROR"));
  act(() => mocks.update?.({ new: row() }));
  expect(result.current[0].stage).toBe("discovery");

  act(() => mocks.status?.("SUBSCRIBED"));
  expect(mocks.refresh).toHaveBeenCalledTimes(1);
  act(() => mocks.update?.({ new: row() }));
  await waitFor(() => expect(result.current[0].stage).toBe("design"));
});
