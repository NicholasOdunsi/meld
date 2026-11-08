import { Buffer } from "node:buffer";
import {
  createDispatchSweeper,
  createProtocolHandler,
  DeviceSession,
  DeviceSessionRegistry,
  type AuthenticatedDeviceIdentity,
  type DeviceSocket,
  type TaskRepository,
} from "@meld/gateway/core";

export interface HubSocketState {
  id: string;
  userId: string;
  lastHeartbeatAt: number;
}

interface DeviceHubCoreOptions {
  repository: TaskRepository;
  heartbeatSeconds: number;
  now?: () => number;
  onError?: (error: unknown) => void;
}

export class DeviceHubCore {
  private readonly registry = new DeviceSessionRegistry();
  private readonly sessions = new Map<DeviceSocket, DeviceSession>();
  private readonly sweeper;
  private readonly protocol;
  private readonly now: () => number;
  private readonly onError: (error: unknown) => void;

  constructor(private readonly options: DeviceHubCoreOptions) {
    this.now = options.now ?? Date.now;
    this.onError =
      options.onError ??
      ((error) => {
        console.error("Gateway hub error", error);
      });
    // start() is never called: the Durable Object alarm drives sweep() instead.
    this.sweeper = createDispatchSweeper({
      repository: options.repository,
      registry: this.registry,
      intervalMs: 1,
      onError: this.onError,
    });
    this.protocol = createProtocolHandler({ repository: options.repository });
  }

  private add(
    socket: DeviceSocket,
    device: AuthenticatedDeviceIdentity,
    lastHeartbeatAt: number,
  ): DeviceSession {
    const session = new DeviceSession(device, socket);
    session.markHeartbeat(lastHeartbeatAt);
    this.sessions.set(socket, session);
    this.registry.add(session);
    return session;
  }

  restore(socket: DeviceSocket, state: HubSocketState): void {
    if (this.sessions.has(socket)) return;
    this.add(socket, { id: state.id, userId: state.userId }, state.lastHeartbeatAt);
  }

  async connect(
    socket: DeviceSocket,
    device: AuthenticatedDeviceIdentity,
  ): Promise<void> {
    const session = this.add(socket, device, this.now());
    session.send({
      type: "session.accepted",
      heartbeatSeconds: this.options.heartbeatSeconds,
    });
    try {
      await this.sweeper.sweepDevice(device.id);
    } catch (error) {
      this.onError(error);
      session.close(1011, "Device connection handler failed");
    }
  }

  async message(
    socket: DeviceSocket,
    data: string | ArrayBuffer,
  ): Promise<void> {
    const session = this.sessions.get(socket);
    if (!session) {
      socket.close(1011, "Unknown device session");
      return;
    }
    const frame =
      typeof data === "string"
        ? Buffer.from(data, "utf8")
        : Buffer.from(new Uint8Array(data));
    const before = session.lastHeartbeatAt;
    try {
      await session.enqueueMessage(() => this.protocol.handle(session, frame));
    } catch (error) {
      this.onError(error);
      session.close(1011, "Device message handler failed");
    }
    // DeviceSession.markHeartbeat() uses Date.now(); re-stamp with the injected clock.
    if (session.lastHeartbeatAt !== before) session.markHeartbeat(this.now());
  }

  state(socket: DeviceSocket): HubSocketState | null {
    const session = this.sessions.get(socket);
    return session
      ? {
          id: session.deviceId,
          userId: session.userId,
          lastHeartbeatAt: session.lastHeartbeatAt,
        }
      : null;
  }

  remove(socket: DeviceSocket): void {
    const session = this.sessions.get(socket);
    if (!session) return;
    this.sessions.delete(socket);
    this.registry.remove(session);
  }

  async tick(): Promise<boolean> {
    this.registry.closeStaleSessions(
      this.now(),
      this.options.heartbeatSeconds * 2_000,
    );
    for (const [socket, session] of this.sessions) {
      if (!session.isOpen) this.sessions.delete(socket);
    }
    try {
      await this.sweeper.sweep();
    } catch (error) {
      this.onError(error);
    }
    return this.sessions.size > 0;
  }
}
