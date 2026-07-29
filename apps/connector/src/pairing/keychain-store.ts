import { randomUUID } from "node:crypto";
import type { CommandRunner } from "../launchd/command-runner";
import type {
  CredentialStore,
  DeviceCredential,
} from "./credential-store";

const SECURITY = "/usr/bin/security";
const SERVICE = "com.meld.agent";
const ITEM_NOT_FOUND = 44;

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
    const result = await this.runner.run(SECURITY, [
      "add-generic-password",
      "-U",
      "-s",
      SERVICE,
      "-a",
      credential.deviceId,
      "-w",
      credential.deviceToken,
    ]);

    if (result.code !== 0) {
      throw failure("save", result.code);
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
    if (this.deviceId === undefined) {
      return;
    }

    const result = await this.runner.run(SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      this.deviceId,
    ]);

    if (result.code !== 0 && result.code !== ITEM_NOT_FOUND) {
      throw failure("delete", result.code);
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
}
