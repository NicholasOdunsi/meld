import { randomUUID } from "node:crypto";
import type {
  CommandResult,
  CommandRunner,
} from "../launchd/command-runner";
import type {
  CredentialStore,
  DeviceCredential,
} from "./credential-store";

const SECURITY = "/usr/bin/security";
const SERVICE = "com.meld.agent";
const ITEM_NOT_FOUND = 44;
export const CURRENT_DEVICE_ACCOUNT =
  "com.meld.agent.current-device";

function failure(operation: string, code: number): Error {
  return new Error(
    `Keychain ${operation} failed with exit code ${code}.`,
  );
}

export class KeychainStore implements CredentialStore {
  private deviceId: string | undefined;

  constructor(
    private readonly runner: CommandRunner,
    deviceId?: string,
  ) {
    this.deviceId = deviceId;
  }

  async save(credential: DeviceCredential): Promise<void> {
    const credentialResult = await this.runner.run(SECURITY, [
      "add-generic-password",
      "-U",
      "-s",
      SERVICE,
      "-a",
      credential.deviceId,
      "-w",
      credential.deviceToken,
    ]);

    if (credentialResult.code !== 0) {
      throw failure("save", credentialResult.code);
    }

    let indexResult: CommandResult;
    try {
      indexResult = await this.runner.run(SECURITY, [
        "add-generic-password",
        "-U",
        "-s",
        SERVICE,
        "-a",
        CURRENT_DEVICE_ACCOUNT,
        "-w",
        credential.deviceId,
      ]);
    } catch {
      await this.rollbackCredential(credential.deviceId);
      throw new Error("Keychain current-device index save failed.");
    }

    if (indexResult.code !== 0) {
      await this.rollbackCredential(credential.deviceId);
      throw failure(
        "current-device index save",
        indexResult.code,
      );
    }

    this.deviceId = credential.deviceId;
  }

  async read(): Promise<DeviceCredential | null> {
    if (this.deviceId === undefined) {
      return null;
    }

    const result = await this.runner.run(SECURITY, [
      "find-generic-password",
      "-s",
      SERVICE,
      "-a",
      this.deviceId,
      "-w",
    ]);

    if (result.code === ITEM_NOT_FOUND) {
      return null;
    }
    if (result.code !== 0) {
      throw failure("read", result.code);
    }

    return {
      deviceId: this.deviceId,
      deviceToken: result.stdout.replace(/[\r\n]+$/, ""),
    };
  }

  async delete(): Promise<void> {
    const boundDeviceId = this.deviceId;
    const targetDeviceId =
      boundDeviceId ?? (await this.readCurrentDeviceId());

    if (targetDeviceId === undefined) {
      return;
    }

    await this.deleteAccount(targetDeviceId, "delete");

    if (boundDeviceId === undefined) {
      await this.deleteAccount(
        CURRENT_DEVICE_ACCOUNT,
        "current-device index delete",
      );
      return;
    }

    const indexedDeviceId = await this.readCurrentDeviceId();
    if (indexedDeviceId === boundDeviceId) {
      await this.deleteAccount(
        CURRENT_DEVICE_ACCOUNT,
        "current-device index delete",
      );
    }

    this.deviceId = undefined;
  }

  async probe(): Promise<boolean> {
    const account = `__probe__:${randomUUID()}`;
    const secret = randomUUID();

    try {
      const write = await this.runner.run(SECURITY, [
        "add-generic-password",
        "-U",
        "-s",
        SERVICE,
        "-a",
        account,
        "-w",
        secret,
      ]);
      if (write.code !== 0) {
        return false;
      }

      const cleanup = await this.runner.run(SECURITY, [
        "delete-generic-password",
        "-s",
        SERVICE,
        "-a",
        account,
      ]);
      return cleanup.code === 0;
    } catch {
      return false;
    }
  }

  private async readCurrentDeviceId(): Promise<string | undefined> {
    const result = await this.runner.run(SECURITY, [
      "find-generic-password",
      "-s",
      SERVICE,
      "-a",
      CURRENT_DEVICE_ACCOUNT,
      "-w",
    ]);

    if (result.code === ITEM_NOT_FOUND) {
      return undefined;
    }
    if (result.code !== 0) {
      throw failure("current-device index read", result.code);
    }

    const indexedDeviceId = result.stdout.replace(/[\r\n]+$/, "");
    if (indexedDeviceId.length === 0) {
      throw new Error("Keychain current-device index is invalid.");
    }
    return indexedDeviceId;
  }

  private async deleteAccount(
    account: string,
    operation: string,
  ): Promise<void> {
    const result = await this.runner.run(SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      account,
    ]);

    if (result.code !== 0 && result.code !== ITEM_NOT_FOUND) {
      throw failure(operation, result.code);
    }
  }

  private async rollbackCredential(deviceId: string): Promise<void> {
    try {
      await this.deleteAccount(deviceId, "rollback");
    } catch {
      // The index failure remains the actionable error. Rollback is best effort.
    }
  }
}
