import { expect, it } from "vitest";
import { createIdleRoomResolver } from "./idle-room-resolver";
import type { Room } from "@/features/rooms/repository";

const CONTEXT = {
  userId: "10000000-0000-4000-8000-000000000001",
  workspaceId: "20000000-0000-4000-8000-000000000001",
};

const NOW = new Date("2026-08-20T12:00:00.000Z");

function room(overrides: Partial<Room> = {}): Room {
  return {
    id: "40000000-0000-4000-8000-000000000004",
    workspaceId: CONTEXT.workspaceId,
    projectId: "30000000-0000-4000-8000-000000000003",
    name: "Invites",
    ownerId: CONTEXT.userId,
    stage: "discovery",
    updatedAt: "2026-08-14T12:00:00.000Z",
    createdAt: "2026-08-01T12:00:00.000Z",
    lastActivityAt: "2026-08-14T12:00:00.000Z",
    ...overrides,
  };
}

it("reports a room that has not moved for longer than the threshold", async () => {
  const resolver = createIdleRoomResolver({
    rooms: [room()],
    now: NOW,
    idleDays: 5,
  });

  const items = await resolver.resolve(CONTEXT);

  expect(items).toHaveLength(1);
  expect(items[0].kind).toBe("room_idle");
  expect(items[0].title).toBe("Nothing has moved here in 6 days.");
  expect(items[0].href).toBe(
    `/${CONTEXT.workspaceId}/rooms/40000000-0000-4000-8000-000000000004`,
  );
  expect(items[0].occurredAt).toBe("2026-08-14T12:00:00.000Z");
});

it("ignores a room that is still moving", async () => {
  const resolver = createIdleRoomResolver({
    rooms: [room({ lastActivityAt: "2026-08-19T12:00:00.000Z" })],
    now: NOW,
    idleDays: 5,
  });

  expect(await resolver.resolve(CONTEXT)).toEqual([]);
});

it("does not report a room sitting exactly on the threshold", async () => {
  const resolver = createIdleRoomResolver({
    rooms: [room({ lastActivityAt: "2026-08-15T12:00:00.000Z" })],
    now: NOW,
    idleDays: 5,
  });

  expect(await resolver.resolve(CONTEXT)).toEqual([]);
});

it("ignores rooms from another workspace", async () => {
  const resolver = createIdleRoomResolver({
    rooms: [room({ workspaceId: "90000000-0000-4000-8000-000000000009" })],
    now: NOW,
    idleDays: 5,
  });

  expect(await resolver.resolve(CONTEXT)).toEqual([]);
});

it("reports the oldest room first", async () => {
  const resolver = createIdleRoomResolver({
    rooms: [
      room({ id: "a", lastActivityAt: "2026-08-13T12:00:00.000Z" }),
      room({ id: "b", lastActivityAt: "2026-08-01T12:00:00.000Z" }),
    ],
    now: NOW,
    idleDays: 5,
  });

  const items = await resolver.resolve(CONTEXT);

  expect(items.map((item) => item.id)).toEqual([
    "room-idle-b",
    "room-idle-a",
  ]);
});
