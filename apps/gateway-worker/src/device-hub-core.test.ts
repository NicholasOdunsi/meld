import { describe, expect, it, vi } from "vitest";
import type { TaskRepository } from "@meld/gateway/core";
import { DeviceHubCore } from "./device-hub-core";

function fakeSocket() {
  return {
    readyState: 1,
    sent: [] as unknown[],
    closed: null as null | [number?, string?],
    send(data: string) {
      this.sent.push(JSON.parse(data));
    },
    close(code?: number, reason?: string) {
      this.closed = [code, reason];
      this.readyState = 3;
    },
  };
}

function fakeRepository(overrides: Partial<TaskRepository> = {}): TaskRepository {
  return {
    listDispatchableProviderSetups: vi.fn(async () => []),
    listDispatchableTasks: vi.fn(async () => []),
    reapExpiredTaskLeases: vi.fn(async () => []),
    recordDeviceConnection: vi.fn(async () => "active"),
    renewTaskLeases: vi.fn(async () => []),
    ...overrides,
  } as unknown as TaskRepository;
}

const device = { id: "device-1", userId: "user-1" };
const TASK_ID = "11111111-1111-4111-8111-111111111111";

describe("DeviceHubCore", () => {
  it("accepts a device and sweeps it immediately", async () => {
    const repository = fakeRepository({
      listDispatchableTasks: vi.fn(async () => [
        {
          kind: "available",
          deviceId: "device-1",
          taskId: TASK_ID,
          status: "ready_to_run",
          attemptId: null,
        },
      ]),
    } as Partial<TaskRepository>);
    const hub = new DeviceHubCore({ repository, heartbeatSeconds: 30 });
    const socket = fakeSocket();
    await hub.connect(socket, device);
    expect(socket.sent).toEqual([
      { type: "session.accepted", heartbeatSeconds: 30 },
      { type: "task.available", taskId: TASK_ID },
    ]);
  });

  it("answers a heartbeat frame sent as a string and records the time", async () => {
    let now = 1_000;
    const hub = new DeviceHubCore({
      repository: fakeRepository(),
      heartbeatSeconds: 30,
      now: () => now,
    });
    const socket = fakeSocket();
    await hub.connect(socket, device);
    now = 5_000;
    await hub.message(
      socket,
      JSON.stringify({
        type: "heartbeat",
        connectorVersion: "1",
        activeTasks: [],
      }),
    );
    expect(socket.sent.at(-1)).toEqual({
      type: "heartbeat.ack",
      renewedTasks: [],
    });
    expect(hub.state(socket)).toEqual({
      id: "device-1",
      userId: "user-1",
      lastHeartbeatAt: 5_000,
    });
  });

  it("closes the socket on an invalid frame", async () => {
    const hub = new DeviceHubCore({
      repository: fakeRepository(),
      heartbeatSeconds: 30,
    });
    const socket = fakeSocket();
    await hub.connect(socket, device);
    await hub.message(socket, "not json");
    expect(socket.closed?.[0]).toBe(1008);
  });

  it("restores sessions after hibernation and keeps ticking while connected", async () => {
    const hub = new DeviceHubCore({
      repository: fakeRepository(),
      heartbeatSeconds: 30,
      now: () => 10_000,
    });
    const socket = fakeSocket();
    hub.restore(socket, {
      id: "device-1",
      userId: "user-1",
      lastHeartbeatAt: 9_000,
    });
    expect(await hub.tick()).toBe(true);
  });

  it("closes sessions silent for two heartbeats and stops ticking when none remain", async () => {
    const hub = new DeviceHubCore({
      repository: fakeRepository(),
      heartbeatSeconds: 30,
      now: () => 100_000,
    });
    const socket = fakeSocket();
    hub.restore(socket, {
      id: "device-1",
      userId: "user-1",
      lastHeartbeatAt: 0,
    });
    expect(await hub.tick()).toBe(false);
    expect(socket.closed).toEqual([1008, "heartbeat_timeout"]);
  });

  it("forgets a removed socket", async () => {
    const hub = new DeviceHubCore({
      repository: fakeRepository(),
      heartbeatSeconds: 30,
    });
    const socket = fakeSocket();
    await hub.connect(socket, device);
    hub.remove(socket);
    expect(hub.state(socket)).toBeNull();
    expect(await hub.tick()).toBe(false);
  });
});
