import { join } from "node:path";
import {
  canvasAuthorityKey,
  type CanvasAuthorityLease,
  type CanvasAuthorityLeaseFactory,
} from "./canvas-authority";
import {
  SqliteCanvasRoom,
  type ServerMarkerResult,
  type SqliteCanvasRoomOptions,
} from "./sqlite-canvas-room";

export const DEFAULT_CANVAS_MAX_ROOMS = 20;
export const DEFAULT_CANVAS_IDLE_EVICTION_MS = 120_000;

export type CanvasRoomManagerErrorCode =
  | "canvas_capacity_reached"
  | "room_authority_unavailable"
  | "canvas_manager_shutting_down"
  | "canvas_room_not_found";

export class CanvasRoomManagerError extends Error {
  readonly code: CanvasRoomManagerErrorCode;

  constructor(code: CanvasRoomManagerErrorCode) {
    super(code);
    this.name = "CanvasRoomManagerError";
    this.code = code;
  }
}

interface ManagedCanvasRoom {
  key: string;
  organizationId: string;
  roomId: string;
  room: SqliteCanvasRoom;
  lease: CanvasAuthorityLease;
  idleTimer: ReturnType<typeof setTimeout> | undefined;
}

export interface CanvasRoomManagerOptions {
  dataDir: string;
  authority: CanvasAuthorityLeaseFactory;
  maxRooms?: number;
  idleEvictionMs?: number;
  createRoom?: (options: SqliteCanvasRoomOptions) => SqliteCanvasRoom;
}

export interface CanvasRoomConnectInput {
  organizationId: string;
  roomId: string;
  sessionId: string;
  socket: Parameters<SqliteCanvasRoom["connect"]>[0]["socket"];
  meta: Parameters<SqliteCanvasRoom["connect"]>[0]["meta"];
}

export interface CanvasRoomEvidence {
  roomId: string;
  activeSessions: number;
  documentClock: number;
  clientAuditCount: number;
  serverAuditCount: number;
  auditEvents: Array<{
    actorId: string;
    sessionId: string;
    documentClock: number;
    origin: "client" | "server";
    touchedRecordIds: string[];
  }>;
  auditFailures: ReturnType<SqliteCanvasRoom["getAuditFailures"]>;
}

export class CanvasRoomManager {
  private readonly rooms = new Map<string, ManagedCanvasRoom>();
  private readonly pending = new Map<string, Promise<SqliteCanvasRoom>>();
  private readonly maxRooms: number;
  private readonly idleEvictionMs: number;
  private readonly createRoom: (
    options: SqliteCanvasRoomOptions,
  ) => SqliteCanvasRoom;
  private shuttingDown = false;

  constructor(private readonly options: CanvasRoomManagerOptions) {
    this.maxRooms = options.maxRooms ?? DEFAULT_CANVAS_MAX_ROOMS;
    this.idleEvictionMs =
      options.idleEvictionMs ?? DEFAULT_CANVAS_IDLE_EVICTION_MS;
    this.createRoom = options.createRoom ?? ((roomOptions) => new SqliteCanvasRoom(roomOptions));
  }

  get activeRoomCount(): number {
    return this.rooms.size;
  }

  async getOrCreate(
    organizationId: string,
    roomId: string,
  ): Promise<SqliteCanvasRoom> {
    if (this.shuttingDown) {
      throw new CanvasRoomManagerError("canvas_manager_shutting_down");
    }

    const key = canvasAuthorityKey(organizationId, roomId);
    const existing = this.rooms.get(key);
    if (existing) return existing.room;
    const inFlight = this.pending.get(key);
    if (inFlight) return inFlight;
    if (this.rooms.size + this.pending.size >= this.maxRooms) {
      throw new CanvasRoomManagerError("canvas_capacity_reached");
    }

    const creation = this.createOwnedRoom(organizationId, roomId, key);
    this.pending.set(key, creation);
    try {
      return await creation;
    } finally {
      this.pending.delete(key);
    }
  }

  async connect(input: CanvasRoomConnectInput): Promise<SqliteCanvasRoom> {
    const room = await this.getOrCreate(input.organizationId, input.roomId);
    this.connectExisting(input);
    return room;
  }

  /**
   * Connect to a room that was prepared during WebSocket pre-validation. This
   * path stays synchronous so TLSocketRoom can attach listeners before the
   * client sends its first frame.
   */
  connectExisting(input: CanvasRoomConnectInput): void {
    const key = canvasAuthorityKey(input.organizationId, input.roomId);
    const entry = this.rooms.get(key);
    if (!entry) {
      throw new CanvasRoomManagerError("canvas_room_not_found");
    }
    this.clearIdleTimer(entry);
    try {
      entry.room.connect({
        sessionId: input.sessionId,
        socket: input.socket,
        meta: input.meta,
      });
    } catch (error) {
      if (entry.room.getNumActiveSessions() === 0) {
        this.scheduleIdleCheck(entry);
      }
      throw error;
    }
  }

  private handleSessionRemoved(key: string): void {
    const entry = this.rooms.get(key);
    if (!entry) return;
    this.clearIdleTimer(entry);
    if (entry.room.getNumActiveSessions() === 0) {
      this.scheduleIdleCheck(entry);
    }
  }

  private clearIdleTimer(entry: ManagedCanvasRoom): void {
    if (!entry.idleTimer) return;
    clearTimeout(entry.idleTimer);
    entry.idleTimer = undefined;
  }

  private scheduleIdleCheck(entry: ManagedCanvasRoom): void {
    if (entry.idleTimer || this.shuttingDown) return;
    const timer = setTimeout(() => {
      entry.idleTimer = undefined;
      if (this.rooms.get(entry.key) !== entry) return;
      if (entry.room.getNumActiveSessions() > 0) return;
      void this.closeEntry(entry);
    }, this.idleEvictionMs);
    timer.unref?.();
    entry.idleTimer = timer;
  }

  private async createOwnedRoom(
    organizationId: string,
    roomId: string,
    key: string,
  ): Promise<SqliteCanvasRoom> {
    const lease = await this.options.authority.acquire(organizationId, roomId);
    if (!lease) {
      throw new CanvasRoomManagerError("room_authority_unavailable");
    }

    let room: SqliteCanvasRoom | undefined;
    try {
      room = this.createRoom({
        organizationId,
        roomId,
        databasePath: join(this.options.dataDir, `${roomId}.sqlite`),
        onSessionRemoved: () => this.handleSessionRemoved(key),
      });
      const entry: ManagedCanvasRoom = {
        key,
        organizationId,
        roomId,
        room,
        lease,
        idleTimer: undefined,
      };
      this.rooms.set(key, entry);
      this.scheduleIdleCheck(entry);
      return room;
    } catch (error) {
      try {
        room?.close();
      } finally {
        await lease.release();
      }
      throw error;
    }
  }

  async insertServerMarker(
    organizationId: string,
    roomId: string,
    label: string,
  ): Promise<ServerMarkerResult> {
    const room = await this.getOrCreate(organizationId, roomId);
    return room.insertServerMarker(label);
  }

  evidence(roomId: string): CanvasRoomEvidence | null;
  evidence(organizationId: string, roomId: string): CanvasRoomEvidence | null;
  evidence(
    organizationIdOrRoomId: string,
    requestedRoomId?: string,
  ): CanvasRoomEvidence | null {
    const roomId = requestedRoomId ?? organizationIdOrRoomId;
    const entry = requestedRoomId
      ? this.rooms.get(canvasAuthorityKey(organizationIdOrRoomId, requestedRoomId))
      : [...this.rooms.values()].find((candidate) => candidate.roomId === roomId);
    if (!entry) return null;
    const events = entry.room.getAuditEvents().map((event) => ({
      actorId: event.actorId,
      sessionId: event.sessionId,
      documentClock: event.documentClock,
      origin: event.origin,
      touchedRecordIds: [...event.touchedRecordIds],
    }));
    return {
      roomId,
      activeSessions: entry.room.getNumActiveSessions(),
      documentClock: entry.room.getSnapshot().documentClock ?? 0,
      clientAuditCount: events.filter((event) => event.origin === "client").length,
      serverAuditCount: events.filter((event) => event.origin === "server").length,
      auditEvents: events,
      auditFailures: entry.room.getAuditFailures(),
    };
  }

  beginShutdown(): void {
    this.shuttingDown = true;
  }

  async closeAll(): Promise<void> {
    this.beginShutdown();
    await Promise.allSettled([...this.pending.values()]);
    const entries = [...this.rooms.values()];
    await Promise.all(entries.map((entry) => this.closeEntry(entry)));
  }

  private async closeEntry(entry: ManagedCanvasRoom): Promise<void> {
    if (this.rooms.get(entry.key) !== entry) return;
    this.rooms.delete(entry.key);
    if (entry.idleTimer) {
      clearTimeout(entry.idleTimer);
      entry.idleTimer = undefined;
    }
    try {
      entry.room.close();
    } finally {
      await entry.lease.release();
    }
  }
}
