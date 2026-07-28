import {
  ServerToDeviceMessageSchema,
  type ServerToDeviceMessage,
} from "@meld/contracts";
import { WebSocket } from "ws";
import type { AuthenticatedDeviceIdentity } from "../auth/device-auth";

export interface DeviceSocket {
  readonly readyState: number;
  send(data: string): void;
  close(code?: number, reason?: string): void;
}

export class DeviceSession {
  readonly deviceId: string;
  readonly userId: string;
  lastHeartbeatAt = Date.now();
  private messageQueue: Promise<void> = Promise.resolve();
  private closing = false;

  constructor(
    device: AuthenticatedDeviceIdentity,
    private readonly socket: DeviceSocket,
  ) {
    this.deviceId = device.id;
    this.userId = device.userId;
  }

  get isOpen(): boolean {
    return !this.closing && this.socket.readyState === WebSocket.OPEN;
  }

  markHeartbeat(at = Date.now()): void {
    this.lastHeartbeatAt = at;
  }

  send(message: ServerToDeviceMessage): void {
    const parsed = ServerToDeviceMessageSchema.parse(message);
    this.socket.send(JSON.stringify(parsed));
  }

  enqueueMessage(operation: () => void | Promise<void>): Promise<void> {
    const queued = this.messageQueue.then(async () => {
      if (!this.isOpen) {
        return;
      }
      await operation();
    });
    this.messageQueue = queued.catch(() => undefined);
    return queued;
  }

  close(code?: number, reason?: string): void {
    this.closing = true;
    this.socket.close(code, reason);
  }
}

export class DeviceSessionRegistry {
  private readonly sessions = new Map<
    string,
    Set<DeviceSession>
  >();

  add(session: DeviceSession): void {
    const deviceSessions =
      this.sessions.get(session.deviceId) ?? new Set<DeviceSession>();
    deviceSessions.add(session);
    this.sessions.set(session.deviceId, deviceSessions);
  }

  remove(session: DeviceSession): void {
    const deviceSessions = this.sessions.get(session.deviceId);
    if (!deviceSessions) {
      return;
    }

    deviceSessions.delete(session);
    if (deviceSessions.size === 0) {
      this.sessions.delete(session.deviceId);
    }
  }

  connectedDeviceIds(): string[] {
    return [...this.sessions.keys()];
  }

  sendToDevice(
    deviceId: string,
    message: ServerToDeviceMessage,
  ): number {
    let delivered = 0;
    for (const session of this.sessions.get(deviceId) ?? []) {
      if (!session.isOpen) {
        continue;
      }

      session.send(message);
      delivered += 1;
    }
    return delivered;
  }

  closeAll(
    code = 1001,
    reason = "Gateway shutting down",
  ): void {
    const activeSessions = [...this.sessions.values()].flatMap(
      (deviceSessions) => [...deviceSessions],
    );
    this.sessions.clear();

    for (const session of activeSessions) {
      session.close(code, reason);
    }
  }
}
