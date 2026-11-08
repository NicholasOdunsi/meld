import { DurableObject } from "cloudflare:workers";
import { assertHeartbeatWithinLease, createTaskRepository, type AuthenticatedDeviceIdentity } from "@meld/gateway/core";
import { DeviceHubCore, type HubSocketState } from "./device-hub-core";
import { createSupabase, positiveInt, type Env } from "./env";
import { DEVICE_HEADER } from "./router";

export class DeviceHub extends DurableObject<Env> {
  private core: DeviceHubCore | undefined;
  private leaseChecked = false;

  private hub(): DeviceHubCore {
    if (!this.core) {
      this.core = new DeviceHubCore({
        repository: createTaskRepository(createSupabase(this.env)),
        heartbeatSeconds: positiveInt(this.env.GATEWAY_HEARTBEAT_SECONDS, "GATEWAY_HEARTBEAT_SECONDS"),
      });
      // Woken from hibernation: rebuild sessions from socket attachments.
      for (const socket of this.ctx.getWebSockets()) {
        const state = socket.deserializeAttachment() as HubSocketState | null;
        if (state) this.core.restore(socket, state);
      }
    }
    return this.core;
  }

  private async checkLease(): Promise<void> {
    if (this.leaseChecked) return;
    const repository = createTaskRepository(createSupabase(this.env));
    assertHeartbeatWithinLease({
      heartbeatSeconds: positiveInt(this.env.GATEWAY_HEARTBEAT_SECONDS, "GATEWAY_HEARTBEAT_SECONDS"),
      leaseSeconds: await repository.getAiTaskLeaseSeconds(),
    });
    this.leaseChecked = true;
  }

  private async ensureAlarm(): Promise<void> {
    if ((await this.ctx.storage.getAlarm()) === null) {
      await this.ctx.storage.setAlarm(Date.now() + positiveInt(this.env.GATEWAY_POLL_INTERVAL_MS, "GATEWAY_POLL_INTERVAL_MS"));
    }
  }

  async fetch(request: Request): Promise<Response> {
    await this.checkLease();
    const device = JSON.parse(request.headers.get(DEVICE_HEADER) ?? "null") as AuthenticatedDeviceIdentity | null;
    if (!device) return new Response("Bad Request", { status: 400 });
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair) as [WebSocket, WebSocket];
    this.ctx.acceptWebSocket(server);
    const state: HubSocketState = { id: device.id, userId: device.userId, lastHeartbeatAt: Date.now() };
    server.serializeAttachment(state);
    this.ctx.waitUntil(this.hub().connect(server, device));
    await this.ensureAlarm();
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(socket: WebSocket, message: string | ArrayBuffer): Promise<void> {
    const hub = this.hub();
    await hub.message(socket, message);
    const state = hub.state(socket);
    if (state) socket.serializeAttachment(state);
  }

  async webSocketClose(socket: WebSocket): Promise<void> {
    this.hub().remove(socket);
  }

  async webSocketError(socket: WebSocket): Promise<void> {
    this.hub().remove(socket);
  }

  async alarm(): Promise<void> {
    if (await this.hub().tick()) await this.ensureAlarm();
  }
}
