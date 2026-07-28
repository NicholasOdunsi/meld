import type { ServerToDeviceMessage } from "@meld/contracts";
import { describe, expect, it, vi } from "vitest";
import {
  DeviceSession,
  DeviceSessionRegistry,
  type DeviceSocket,
} from "./device-session";

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "77777777-7777-4777-8777-777777777777";

function createSocket(readyState = 1) {
  return {
    readyState,
    send: vi.fn(),
    close: vi.fn(),
  } satisfies DeviceSocket;
}

function createSession(socket = createSocket()) {
  return new DeviceSession(
    { id: DEVICE_ID, userId: USER_ID },
    socket,
  );
}

describe("DeviceSession", () => {
  it("validates and serializes server messages", () => {
    const socket = createSocket();
    const session = createSession(socket);

    session.send({ type: "session.accepted", heartbeatSeconds: 30 });

    expect(socket.send).toHaveBeenCalledWith(
      JSON.stringify({
        type: "session.accepted",
        heartbeatSeconds: 30,
      }),
    );
    expect(() =>
      session.send({
        type: "session.accepted",
        heartbeatSeconds: 0,
      } as ServerToDeviceMessage),
    ).toThrow();
  });

  it("tracks heartbeat time in memory", () => {
    const session = createSession();

    session.markHeartbeat(1234);

    expect(session.lastHeartbeatAt).toBe(1234);
  });
});

describe("DeviceSessionRegistry", () => {
  it("deduplicates connected IDs while retaining multiple sockets", () => {
    const registry = new DeviceSessionRegistry();
    const first = createSession();
    const second = createSession();

    registry.add(first);
    registry.add(second);

    expect(registry.connectedDeviceIds()).toEqual([DEVICE_ID]);

    registry.remove(first);
    expect(registry.connectedDeviceIds()).toEqual([DEVICE_ID]);

    registry.remove(second);
    expect(registry.connectedDeviceIds()).toEqual([]);
  });

  it("broadcasts to every open socket for a device", () => {
    const registry = new DeviceSessionRegistry();
    const firstSocket = createSocket();
    const secondSocket = createSocket();
    const closedSocket = createSocket(3);
    registry.add(createSession(firstSocket));
    registry.add(createSession(secondSocket));
    registry.add(createSession(closedSocket));

    const delivered = registry.sendToDevice(DEVICE_ID, {
      type: "task.available",
      taskId: "11111111-1111-4111-8111-111111111111",
    });

    expect(delivered).toBe(2);
    expect(firstSocket.send).toHaveBeenCalledOnce();
    expect(secondSocket.send).toHaveBeenCalledOnce();
    expect(closedSocket.send).not.toHaveBeenCalled();
  });

  it("closes every socket and clears the connected set", () => {
    const registry = new DeviceSessionRegistry();
    const firstSocket = createSocket();
    const secondSocket = createSocket();
    registry.add(createSession(firstSocket));
    registry.add(createSession(secondSocket));

    registry.closeAll();

    expect(firstSocket.close).toHaveBeenCalledWith(
      1001,
      "Gateway shutting down",
    );
    expect(secondSocket.close).toHaveBeenCalledWith(
      1001,
      "Gateway shutting down",
    );
    expect(registry.connectedDeviceIds()).toEqual([]);
  });
});
