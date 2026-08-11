import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteCanvasRoom } from "./sqlite-canvas-room";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const directories: string[] = [];

async function createRoom() {
  const directory = await mkdtemp(join(tmpdir(), "meld-canvas-room-"));
  directories.push(directory);
  const databasePath = join(directory, "room.sqlite");
  return {
    databasePath,
    room: new SqliteCanvasRoom({
      organizationId: ORGANIZATION_ID,
      roomId: ROOM_ID,
      databasePath,
    }),
  };
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("SqliteCanvasRoom", () => {
  it("configures durable SQLite pragmas", async () => {
    const { room } = await createRoom();
    expect(room.pragmas()).toEqual({
      journalMode: "wal",
      synchronous: 2,
      foreignKeys: 1,
    });
    room.close();
  });

  it("persists a server marker and reports server-origin evidence", async () => {
    const { room, databasePath } = await createRoom();
    const marker = room.insertServerMarker("Persisted by the gateway");
    expect(marker).toMatchObject({ documentClock: 1 });
    expect(marker.recordId).toMatch(/^shape:/);
    expect(
      room
        .getSnapshot()
        .documents.filter((document) => document.state.typeName === "shape"),
    ).toHaveLength(1);
    expect(JSON.stringify(room.getSnapshot())).toContain("Persisted by the gateway");
    expect(room.getAuditEvents()).toContainEqual(
      expect.objectContaining({
        origin: "server",
        documentClock: marker.documentClock,
        touchedRecordIds: [marker.recordId],
      }),
    );
    expect(room.getAuditEvents().filter((event) => event.origin === "client")).toEqual([]);
    room.close();

    const reopened = new SqliteCanvasRoom({
      organizationId: ORGANIZATION_ID,
      roomId: ROOM_ID,
      databasePath,
    });
    const persistedShapes = reopened
      .getSnapshot()
      .documents.filter((document) => document.state.typeName === "shape");
    expect(persistedShapes).toHaveLength(1);
    expect(JSON.stringify(persistedShapes[0])).toContain("Persisted by the gateway");
    expect(reopened.getSnapshot().documentClock).toBe(marker.documentClock);
    reopened.close();
  });

  it("makes close idempotent and rejects later connections or writes", async () => {
    const { room } = await createRoom();
    room.close();
    room.close();
    expect(() => room.insertServerMarker("closed")).toThrow("Canvas room is closed");
  });

  it("rejects a session ticket bound to another organization or room", async () => {
    const { room } = await createRoom();
    expect(() =>
      room.connect({
        sessionId: "session-mismatch",
        socket: {} as never,
        meta: {
          organizationId: "00000000-0000-4000-8000-000000000099",
          roomId: ROOM_ID,
          userId: "10000000-0000-4000-8000-000000000001",
          userName: "Editor A",
          access: "edit",
          clientVersion: "5.3.0",
        },
      }),
    ).toThrow("Canvas session room identity mismatch");
    room.close();
  });
});
