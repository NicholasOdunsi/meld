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

function incompleteCleanup(stages: string[]): Error {
  return new Error(
    `Keychain cleanup is incomplete; failed stages: ${stages.join(", ")}.`,
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
    const previousDeviceId = await this.readCurrentDeviceId();
    const previousToken =
      previousDeviceId !== undefined &&
      previousDeviceId !== credential.deviceId
        ? await this.readAccountToken(previousDeviceId)
        : undefined;

    try {
      await this.saveAccount(
        credential.deviceId,
        credential.deviceToken,
        "save",
      );
    } catch (saveFailure) {
      await this.rollbackCredential(credential.deviceId);
      throw saveFailure;
    }

    try {
      await this.saveAccount(
        CURRENT_DEVICE_ACCOUNT,
        credential.deviceId,
        "current-device index save",
      );
    } catch (indexFailure) {
      if (previousDeviceId === undefined) {
        await this.rollbackFirstPair(credential.deviceId);
      } else if (previousDeviceId !== credential.deviceId) {
        await this.rollbackDeviceSwitch({
          previousDeviceId,
          previousToken,
          newDeviceId: credential.deviceId,
        });
      } else {
        await this.rollbackCredential(credential.deviceId);
      }
      throw indexFailure;
    }

    if (
      previousDeviceId !== undefined &&
      previousDeviceId !== credential.deviceId
    ) {
      try {
        await this.deleteAccount(
          previousDeviceId,
          "previous credential cleanup",
        );
      } catch (deleteFailure) {
        await this.rollbackDeviceSwitch({
          previousDeviceId,
          previousToken,
          newDeviceId: credential.deviceId,
        });
        throw deleteFailure;
      }
    }

    this.deviceId = credential.deviceId;
  }

  async read(): Promise<DeviceCredential | null> {
    if (this.deviceId === undefined) {
      return null;
    }

    const result = await this.runChecked(
      "read",
      [
        "find-generic-password",
        "-s",
        SERVICE,
        "-a",
        this.deviceId,
        "-w",
      ],
      [0, ITEM_NOT_FOUND],
    );

    if (result.code === ITEM_NOT_FOUND) {
      return null;
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
    const result = await this.runChecked(
      "current-device index read",
      [
        "find-generic-password",
        "-s",
        SERVICE,
        "-a",
        CURRENT_DEVICE_ACCOUNT,
        "-w",
      ],
      [0, ITEM_NOT_FOUND],
    );

    if (result.code === ITEM_NOT_FOUND) {
      return undefined;
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
    await this.runChecked(
      operation,
      [
        "delete-generic-password",
        "-s",
        SERVICE,
        "-a",
        account,
      ],
      [0, ITEM_NOT_FOUND],
    );
  }

  private async saveAccount(
    account: string,
    secret: string,
    operation: string,
  ): Promise<void> {
    await this.runChecked(operation, [
      "add-generic-password",
      "-U",
      "-s",
      SERVICE,
      "-a",
      account,
      "-w",
      secret,
    ]);
  }

  private async readAccountToken(
    account: string,
  ): Promise<string | undefined> {
    const result = await this.runChecked(
      "previous credential read",
      [
        "find-generic-password",
        "-s",
        SERVICE,
        "-a",
        account,
        "-w",
      ],
      [0, ITEM_NOT_FOUND],
    );
    if (result.code === ITEM_NOT_FOUND) {
      return undefined;
    }
    return result.stdout.replace(/[\r\n]+$/, "");
  }

  private async runChecked(
    operation: string,
    args: string[],
    acceptedCodes: number[] = [0],
  ): Promise<CommandResult> {
    let result: CommandResult;
    try {
      result = await this.runner.run(SECURITY, args);
    } catch {
      throw new Error(`Keychain ${operation} failed.`);
    }
    if (!acceptedCodes.includes(result.code)) {
      throw failure(operation, result.code);
    }
    return result;
  }

  private async rollbackDeviceSwitch({
    previousDeviceId,
    previousToken,
    newDeviceId,
  }: {
    previousDeviceId: string;
    previousToken: string | undefined;
    newDeviceId: string;
  }): Promise<void> {
    const compensations: Array<{
      stage: string;
      run: () => Promise<void>;
    }> = [];
    if (previousToken !== undefined) {
      compensations.push({
        stage: "previous credential restore",
        run: () =>
          this.saveAccount(
            previousDeviceId,
            previousToken,
            "previous credential restore",
          ),
      });
    }
    compensations.push(
      {
        stage: "current-device index restore",
        run: () =>
          this.saveAccount(
            CURRENT_DEVICE_ACCOUNT,
            previousDeviceId,
            "current-device index restore",
          ),
      },
      {
        stage: "new credential removal",
        run: () =>
          this.deleteAccount(
            newDeviceId,
            "new credential removal",
          ),
      },
    );
    await this.runCompensations(compensations);
  }

  private async rollbackFirstPair(
    newDeviceId: string,
  ): Promise<void> {
    await this.runCompensations([
      {
        stage: "current-device index removal",
        run: () =>
          this.deleteAccount(
            CURRENT_DEVICE_ACCOUNT,
            "current-device index removal",
          ),
      },
      {
        stage: "new credential removal",
        run: () =>
          this.deleteAccount(
            newDeviceId,
            "new credential removal",
          ),
      },
    ]);
  }

  private async rollbackCredential(deviceId: string): Promise<void> {
    await this.runCompensations([
      {
        stage: "new credential removal",
        run: () =>
          this.deleteAccount(
            deviceId,
            "new credential removal",
          ),
      },
    ]);
  }

  private async runCompensations(
    compensations: Array<{
      stage: string;
      run: () => Promise<void>;
    }>,
  ): Promise<void> {
    const failedStages: string[] = [];
    for (const compensation of compensations) {
      try {
        await compensation.run();
      } catch {
        failedStages.push(compensation.stage);
      }
    }
    if (failedStages.length > 0) {
      throw incompleteCleanup(failedStages);
    }
  }
}
