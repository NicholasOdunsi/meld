import type { TaskRepository } from "../tasks/task-repository";
import * as deviceToken from "@meld/device-auth";

const DUMMY_DEVICE_TOKEN_HASH = "0".repeat(64);
const UNREPORTED_CONNECTOR_VERSION = "unknown";

type DeviceAuthRepository = Pick<
  TaskRepository,
  "getExecutionDeviceForAuth" | "recordDeviceConnection"
>;

export interface AuthenticatedDeviceIdentity {
  id: string;
  userId: string;
}

export class DeviceAuthenticationError extends Error {
  constructor() {
    super("Device authentication failed");
    this.name = "DeviceAuthenticationError";
  }
}

export async function authenticateDevice(
  authorization: string | undefined,
  repository: DeviceAuthRepository,
): Promise<AuthenticatedDeviceIdentity> {
  const credential =
    deviceToken.parseDeviceAuthorization(authorization);
  if (!credential) {
    throw new DeviceAuthenticationError();
  }

  const device = await repository.getExecutionDeviceForAuth(
    credential.deviceId,
  );
  const verified = deviceToken.verifyToken(
    credential.secret,
    device?.tokenHash ?? DUMMY_DEVICE_TOKEN_HASH,
  );

  if (!verified || !device || device.status !== "active") {
    throw new DeviceAuthenticationError();
  }

  const recordedStatus = await repository.recordDeviceConnection(
    device.id,
    UNREPORTED_CONNECTOR_VERSION,
  );
  if (recordedStatus !== "active") {
    throw new DeviceAuthenticationError();
  }
  return { id: device.id, userId: device.userId };
}
