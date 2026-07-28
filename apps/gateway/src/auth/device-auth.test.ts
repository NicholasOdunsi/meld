import * as deviceToken from "@meld/device-auth";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TaskRepository } from "../tasks/task-repository";
import { authenticateDevice } from "./device-auth";

const DEVICE_ID = "33333333-3333-4333-8333-333333333333";
const USER_ID = "77777777-7777-4777-8777-777777777777";
const SECRET = "device-secret";
const AUTHORIZATION = `Device ${DEVICE_ID}.${SECRET}`;
const DUMMY_DIGEST = "0".repeat(64);

function createRepository(
  device: Awaited<
    ReturnType<TaskRepository["getExecutionDeviceForAuth"]>
  > = {
    id: DEVICE_ID,
    userId: USER_ID,
    tokenHash: deviceToken.hashToken(SECRET),
    status: "active",
  },
) {
  return {
    getExecutionDeviceForAuth: vi.fn().mockResolvedValue(device),
    recordDeviceConnection: vi.fn().mockResolvedValue(undefined),
  } as unknown as TaskRepository;
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe("authenticateDevice", () => {
  it.each([
    undefined,
    "",
    `${DEVICE_ID}.${SECRET}`,
    `Bearer ${DEVICE_ID}.${SECRET}`,
    `device ${DEVICE_ID}.${SECRET}`,
    `Device not-a-uuid.${SECRET}`,
    `Device ${DEVICE_ID}.not+base64`,
    `Device ${DEVICE_ID}.${SECRET} trailing`,
  ])("rejects a missing or malformed Device authorization header", async (header) => {
    const repository = createRepository();

    await expect(authenticateDevice(header, repository)).rejects.toThrow(
      "Device authentication failed",
    );
    expect(repository.getExecutionDeviceForAuth).not.toHaveBeenCalled();
    expect(repository.recordDeviceConnection).not.toHaveBeenCalled();
  });

  it("uses a fixed 32-byte dummy digest when the device does not exist", async () => {
    const repository = createRepository(null);
    const verifier = vi.spyOn(deviceToken, "verifyToken");

    await expect(
      authenticateDevice(AUTHORIZATION, repository),
    ).rejects.toThrow("Device authentication failed");

    expect(verifier).toHaveBeenCalledWith(SECRET, DUMMY_DIGEST);
    expect(repository.recordDeviceConnection).not.toHaveBeenCalled();
  });

  it("rejects revoked devices with the same generic error", async () => {
    const repository = createRepository({
      id: DEVICE_ID,
      userId: USER_ID,
      tokenHash: deviceToken.hashToken(SECRET),
      status: "revoked",
    });

    await expect(
      authenticateDevice(AUTHORIZATION, repository),
    ).rejects.toThrow("Device authentication failed");
    expect(repository.recordDeviceConnection).not.toHaveBeenCalled();
  });

  it("rejects the wrong secret with the same generic error", async () => {
    const repository = createRepository();

    await expect(
      authenticateDevice(
        `Device ${DEVICE_ID}.wrong-secret`,
        repository,
      ),
    ).rejects.toThrow("Device authentication failed");
    expect(repository.recordDeviceConnection).not.toHaveBeenCalled();
  });

  it("records only after verification and returns the device identity", async () => {
    const order: string[] = [];
    const repository = createRepository();
    const verifier = vi
      .spyOn(deviceToken, "verifyToken")
      .mockImplementation(() => {
        order.push("verify");
        return true;
      });
    vi.mocked(repository.recordDeviceConnection).mockImplementation(
      async () => {
        order.push("record");
      },
    );

    await expect(
      authenticateDevice(AUTHORIZATION, repository),
    ).resolves.toEqual({ id: DEVICE_ID, userId: USER_ID });

    expect(verifier).toHaveBeenCalledOnce();
    expect(repository.recordDeviceConnection).toHaveBeenCalledWith(
      DEVICE_ID,
      "unknown",
    );
    expect(order).toEqual(["verify", "record"]);
  });
});
