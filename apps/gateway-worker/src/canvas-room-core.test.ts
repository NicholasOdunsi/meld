import { DatabaseSync } from "node:sqlite";
import { NodeSqliteWrapper } from "@tldraw/sync-core";
import { describe, expect, it } from "vitest";
import { connectCanvasSession, createCanvasSocketRoom } from "./canvas-room-core";

function fakeSocket() {
  const listeners = new Map<string, Set<(event: unknown) => void>>();
  return {
    readyState: 1,
    sent: [] as unknown[],
    send(data: string) {
      this.sent.push(data);
    },
    close() {
      this.readyState = 3;
    },
    addEventListener(type: string, fn: (event: unknown) => void) {
      if (!listeners.has(type)) listeners.set(type, new Set());
      listeners.get(type)!.add(fn);
    },
    removeEventListener(type: string, fn: (event: unknown) => void) {
      listeners.get(type)?.delete(fn);
    },
  };
}

const claims = {
  version: 1 as const,
  workspaceId: "w",
  roomId: "r",
  userId: "u",
  userName: "N",
  access: "edit" as const,
  clientVersion: "5.3.0" as const,
  expiresAt: Date.now() + 60_000,
  nonce: "n",
};

describe("canvas room core", () => {
  it("creates an empty room backed by SQLite and accepts a session", () => {
    const room = createCanvasSocketRoom(
      new NodeSqliteWrapper(new DatabaseSync(":memory:")),
    );
    expect(room.getNumActiveSessions()).toBe(0);
    connectCanvasSession(room, {
      sessionId: "s1",
      socket: fakeSocket(),
      claims,
    });
    expect(room.getNumActiveSessions()).toBe(1);
    room.close();
  });

  it("connects viewers read-only", () => {
    const room = createCanvasSocketRoom(
      new NodeSqliteWrapper(new DatabaseSync(":memory:")),
    );
    connectCanvasSession(room, {
      sessionId: "s2",
      socket: fakeSocket(),
      claims: { ...claims, access: "view" },
    });
    expect(room.getNumActiveSessions()).toBe(1);
    room.close();
  });
});
