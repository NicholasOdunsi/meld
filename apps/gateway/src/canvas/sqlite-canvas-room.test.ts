import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { SqliteCanvasRoom } from "./sqlite-canvas-room";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const directories: string[] = [];

async function createRoom() {
  const directory = await mkdtemp(join(tmpdir(), "meld-canvas-room-"));
  directories.push(directory);
  const databasePath = join(directory, "room.sqlite");
  return {
    databasePath,
    room: new SqliteCanvasRoom({
      workspaceId: WORKSPACE_ID,
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
      workspaceId: WORKSPACE_ID,
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

  it("rejects a session ticket bound to another workspace or room", async () => {
    const { room } = await createRoom();
    expect(() =>
      room.connect({
        sessionId: "session-mismatch",
        socket: {} as never,
        meta: {
          workspaceId: "00000000-0000-4000-8000-000000000099",
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

  it("persists a screen frame and its meldScreenId across a reopen", async () => {
    const { room, databasePath } = await createRoom();
    const screenId = "11111111-1111-4111-8111-111111111111";

    const frame = room.insertScreenFrame(screenId);
    expect(frame.recordId).toMatch(/^shape:/);

    const shapes = room
      .getSnapshot()
      .documents.filter((document) => document.state.typeName === "shape");
    expect(shapes).toHaveLength(1);
    expect(shapes[0].state).toMatchObject({
      type: "frame",
      meta: { meldScreenId: screenId },
    });
    room.close();

    const reopened = new SqliteCanvasRoom({
      workspaceId: WORKSPACE_ID,
      roomId: ROOM_ID,
      databasePath,
    });
    const persisted = reopened
      .getSnapshot()
      .documents.filter((document) => document.state.typeName === "shape");
    expect(persisted[0].state).toMatchObject({
      type: "frame",
      meta: { meldScreenId: screenId },
    });
    reopened.close();
  });

  it("keeps screen frames distinguishable from ordinary shapes", async () => {
    const { room } = await createRoom();
    room.insertServerMarker("ordinary");
    room.insertScreenFrame("22222222-2222-4222-8222-222222222222");

    const withScreenId = room
      .getSnapshot()
      .documents.filter(
        (document) =>
          document.state.typeName === "shape" &&
          typeof (document.state as { meta?: Record<string, unknown> }).meta
            ?.meldScreenId === "string",
      );
    expect(withScreenId).toHaveLength(1);
    room.close();
  });
});
