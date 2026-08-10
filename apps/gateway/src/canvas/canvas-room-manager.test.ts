import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  CanvasRoomManager,
} from "./canvas-room-manager";
import type {
  CanvasAuthorityLease,
  CanvasAuthorityLeaseFactory,
} from "./canvas-authority";
import { SqliteCanvasRoom } from "./sqlite-canvas-room";
import type { SqliteCanvasRoomOptions } from "./sqlite-canvas-room";

const ORGANIZATION_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const OTHER_ROOM_ID = "40000000-0000-4000-8000-000000000002";
const directories: string[] = [];

function authorityFactory(options: { available?: boolean } = {}) {
  const leases = new Map<string, { release: ReturnType<typeof vi.fn> }>();
  const factory: CanvasAuthorityLeaseFactory = {
    acquire: vi.fn(async (organizationId, roomId) => {
      const key = `${organizationId}:${roomId}`;
      if (options.available === false || leases.has(key)) return null;
      const lease = {
        release: vi.fn(async () => {
          leases.delete(key);
        }),
      };
      leases.set(key, lease);
      return { key, release: lease.release } satisfies CanvasAuthorityLease;
    }),
  };
  return { factory, leases };
}

async function dataDir() {
  const directory = await mkdtemp(join(tmpdir(), "meld-canvas-manager-"));
  directories.push(directory);
  return directory;
}

function controlledRoom() {
  let activeSessions = 0;
  let onSessionRemoved: (() => void) | undefined;
  const room = {
    connect: vi.fn(() => {
      activeSessions += 1;
    }),
    close: vi.fn(),
    getNumActiveSessions: vi.fn(() => activeSessions),
    getSnapshot: vi.fn(() => ({ documentClock: 0 })),
    getAuditEvents: vi.fn(() => []),
    getAuditFailures: vi.fn(() => []),
  } as unknown as SqliteCanvasRoom;
  const createRoom = (options: SqliteCanvasRoomOptions) => {
    onSessionRemoved = options.onSessionRemoved;
    return room;
  };
  return {
    room,
    createRoom,
    setActiveSessions(count: number) {
      activeSessions = count;
    },
    notifySessionRemoved() {
      onSessionRemoved?.();
    },
  };
}

function connectInput() {
  return {
    organizationId: ORGANIZATION_ID,
    roomId: ROOM_ID,
    sessionId: "session-1",
    socket: {} as never,
    meta: {
      organizationId: ORGANIZATION_ID,
      roomId: ROOM_ID,
      userId: "10000000-0000-4000-8000-000000000001",
      userName: "Test User",
      access: "edit" as const,
      clientVersion: "5.3.0" as const,
    },
  };
}

afterEach(async () => {
  vi.useRealTimers();
  await Promise.all(
    directories.splice(0).map((directory) =>
      rm(directory, { recursive: true, force: true }),
    ),
  );
});

describe("CanvasRoomManager", () => {
  it("acquires authority before publishing a room and releases it on close", async () => {
    const { factory, leases } = authorityFactory();
    const manager = new CanvasRoomManager({
      dataDir: await dataDir(),
      authority: factory,
    });

    const room = await manager.getOrCreate(ORGANIZATION_ID, ROOM_ID);
    expect(manager.activeRoomCount).toBe(1);
    expect(factory.acquire).toHaveBeenCalledWith(ORGANIZATION_ID, ROOM_ID);
    expect(leases.size).toBe(1);

    manager.beginShutdown();
    await manager.closeAll();
    expect(manager.activeRoomCount).toBe(0);
    expect(leases.size).toBe(0);
    expect(() => room.insertServerMarker("closed")).toThrow(
      "Canvas room is closed",
    );
  });

  it("rejects a held authority lock and enforces the active-room capacity", async () => {
    const unavailable = authorityFactory({ available: false });
    const blocked = new CanvasRoomManager({
      dataDir: await dataDir(),
      authority: unavailable.factory,
    });
    await expect(
      blocked.getOrCreate(ORGANIZATION_ID, ROOM_ID),
    ).rejects.toMatchObject({
      code: "room_authority_unavailable",
    });

    const { factory } = authorityFactory();
    const manager = new CanvasRoomManager({
      dataDir: await dataDir(),
      authority: factory,
      maxRooms: 1,
    });
    await manager.getOrCreate(ORGANIZATION_ID, ROOM_ID);
    await expect(
      manager.getOrCreate(ORGANIZATION_ID, OTHER_ROOM_ID),
    ).rejects.toMatchObject({
      code: "canvas_capacity_reached",
    });
    await manager.closeAll();
  });

  it("cleans up the lease when room construction fails", async () => {
    const { factory, leases } = authorityFactory();
    const manager = new CanvasRoomManager({
      dataDir: await dataDir(),
      authority: factory,
      createRoom: () => {
        throw new Error("room construction failed");
      },
    });
    await expect(
      manager.getOrCreate(ORGANIZATION_ID, ROOM_ID),
    ).rejects.toThrow("room construction failed");
    expect(leases.size).toBe(0);
    expect(manager.activeRoomCount).toBe(0);
  });

  it("evicts a room after it has remained idle", async () => {
    vi.useFakeTimers();
    const { factory, leases } = authorityFactory();
    const manager = new CanvasRoomManager({
      dataDir: await dataDir(),
      authority: factory,
      idleEvictionMs: 25,
    });
    await manager.getOrCreate(ORGANIZATION_ID, ROOM_ID);
    expect(manager.activeRoomCount).toBe(1);
    await vi.advanceTimersByTimeAsync(25);
    await vi.waitFor(() => expect(manager.activeRoomCount).toBe(0));
    expect(leases.size).toBe(0);
  });

  it("cancels a pending idle timer when a prepared room accepts a connection", async () => {
    vi.useFakeTimers();
    const { factory, leases } = authorityFactory();
    const controlled = controlledRoom();
    const manager = new CanvasRoomManager({
      dataDir: await dataDir(),
      authority: factory,
      idleEvictionMs: 25,
      createRoom: controlled.createRoom,
    });
    await manager.getOrCreate(ORGANIZATION_ID, ROOM_ID);
    await manager.connectExisting(connectInput());
    await vi.advanceTimersByTimeAsync(25);
    expect(manager.activeRoomCount).toBe(1);
    expect(leases.size).toBe(1);
    await manager.closeAll();
  });

  it("resets the full idle window after a late session disconnect", async () => {
    vi.useFakeTimers();
    const { factory, leases } = authorityFactory();
    const controlled = controlledRoom();
    const manager = new CanvasRoomManager({
      dataDir: await dataDir(),
      authority: factory,
      idleEvictionMs: 25,
      createRoom: controlled.createRoom,
    });
    await manager.getOrCreate(ORGANIZATION_ID, ROOM_ID);
    await manager.connectExisting(connectInput());
    await vi.advanceTimersByTimeAsync(20);
    controlled.setActiveSessions(0);
    controlled.notifySessionRemoved();
    await vi.advanceTimersByTimeAsync(24);
    expect(manager.activeRoomCount).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await vi.waitFor(() => expect(manager.activeRoomCount).toBe(0));
    expect(leases.size).toBe(0);
  });

  it("does not allow new rooms once shutdown begins", async () => {
    const { factory } = authorityFactory();
    const manager = new CanvasRoomManager({
      dataDir: await dataDir(),
      authority: factory,
    });
    manager.beginShutdown();
    await expect(
      manager.getOrCreate(ORGANIZATION_ID, ROOM_ID),
    ).rejects.toMatchObject({
      code: "canvas_manager_shutting_down",
    });
    await manager.closeAll();
  });

  it("uses the same persisted room for marker and evidence calls", async () => {
    const { factory } = authorityFactory();
    const manager = new CanvasRoomManager({
      dataDir: await dataDir(),
      authority: factory,
      createRoom: (options) => new SqliteCanvasRoom(options),
    });
    const marker = await manager.insertServerMarker(
      ORGANIZATION_ID,
      ROOM_ID,
      "server marker",
    );
    expect(marker.documentClock).toBe(1);
    expect(manager.evidence(ORGANIZATION_ID, ROOM_ID)).toMatchObject({
      roomId: ROOM_ID,
      serverAuditCount: 1,
      documentClock: 1,
    });
    await manager.closeAll();
  });
});
