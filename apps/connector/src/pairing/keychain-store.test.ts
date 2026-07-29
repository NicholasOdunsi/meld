import { describe, expect, it, vi } from "vitest";
import type {
  CommandResult,
  CommandRunner,
} from "../launchd/command-runner";
import {
  CURRENT_DEVICE_ACCOUNT,
  KeychainStore,
} from "./keychain-store";

const DEVICE_ID = "40000000-0000-0000-0000-000000000001";
const CREDENTIAL = {
  deviceId: DEVICE_ID,
  deviceToken: "dt_secret",
};
const SECURITY = "/usr/bin/security";
const SERVICE = "com.meld.agent";

function commandRunner(
  results: CommandResult[] = [],
) {
  const run = vi
    .fn<CommandRunner["run"]>()
    .mockResolvedValue({ stdout: "", code: 0 });
  for (const result of results) {
    run.mockResolvedValueOnce(result);
  }
  return { run };
}

describe("keychain credential store", () => {
  it("saves the device token under the device ID account", async () => {
    const runner = commandRunner();
    const store = new KeychainStore(runner);

    await store.save(CREDENTIAL);

    expect(runner.run).toHaveBeenCalledWith(SECURITY, [
      "add-generic-password",
      "-U",
      "-s",
      SERVICE,
      "-a",
      DEVICE_ID,
      "-w",
      "dt_secret",
    ]);
    expect(runner.run).toHaveBeenNthCalledWith(2, SECURITY, [
      "add-generic-password",
      "-U",
      "-s",
      SERVICE,
      "-a",
      CURRENT_DEVICE_ACCOUNT,
      "-w",
      DEVICE_ID,
    ]);
  });

  it("throws when Keychain rejects a save", async () => {
    const store = new KeychainStore(
      commandRunner([{ stdout: "", code: 36 }]),
    );

    await expect(store.save(CREDENTIAL)).rejects.toThrow(
      /exit code 36/i,
    );
    await expect(store.read()).resolves.toBeNull();
  });

  it("rolls back the credential when the current-device index cannot be written", async () => {
    const runner = commandRunner([
      { stdout: "", code: 0 },
      { stdout: "", code: 36 },
      { stdout: "", code: 0 },
    ]);
    const store = new KeychainStore(runner);

    await expect(store.save(CREDENTIAL)).rejects.toThrow(
      /current-device index.*exit code 36/i,
    );
    expect(runner.run).toHaveBeenNthCalledWith(3, SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      DEVICE_ID,
    ]);
    await expect(store.read()).resolves.toBeNull();
  });

  it("best-effort rolls back when writing the current-device index throws", async () => {
    const run = vi
      .fn<CommandRunner["run"]>()
      .mockResolvedValueOnce({ stdout: "", code: 0 })
      .mockRejectedValueOnce(new Error("Keychain unavailable"))
      .mockResolvedValueOnce({ stdout: "", code: 0 });
    const store = new KeychainStore({ run });

    await expect(store.save(CREDENTIAL)).rejects.toThrow(
      /current-device index save failed/i,
    );
    expect(run).toHaveBeenNthCalledWith(3, SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      DEVICE_ID,
    ]);
    await expect(store.read()).resolves.toBeNull();
  });

  it("reads the trimmed token for its bound device ID", async () => {
    const runner = commandRunner([
      { stdout: "dt_secret\n", code: 0 },
    ]);
    const store = new KeychainStore(runner, DEVICE_ID);

    await expect(store.read()).resolves.toEqual(CREDENTIAL);
    expect(runner.run).toHaveBeenCalledWith(SECURITY, [
      "find-generic-password",
      "-s",
      SERVICE,
      "-a",
      DEVICE_ID,
      "-w",
    ]);
  });

  it("returns null only when security reports item-not-found exit 44", async () => {
    const store = new KeychainStore(
      commandRunner([{ stdout: "", code: 44 }]),
      DEVICE_ID,
    );

    await expect(store.read()).resolves.toBeNull();
  });

  it("throws rather than treating other read failures as missing", async () => {
    const store = new KeychainStore(
      commandRunner([{ stdout: "", code: 36 }]),
      DEVICE_ID,
    );

    await expect(store.read()).rejects.toThrow(/exit code 36/i);
  });

  it("deletes the bound account", async () => {
    const runner = commandRunner([
      { stdout: "", code: 0 },
      { stdout: `${DEVICE_ID}\n`, code: 0 },
      { stdout: "", code: 0 },
    ]);
    const store = new KeychainStore(runner, DEVICE_ID);

    await store.delete();

    expect(runner.run).toHaveBeenCalledWith(SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      DEVICE_ID,
    ]);
    expect(runner.run).toHaveBeenNthCalledWith(2, SECURITY, [
      "find-generic-password",
      "-s",
      SERVICE,
      "-a",
      CURRENT_DEVICE_ACCOUNT,
      "-w",
    ]);
    expect(runner.run).toHaveBeenNthCalledWith(3, SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      CURRENT_DEVICE_ACCOUNT,
    ]);
  });

  it("treats an already-missing delete as successful", async () => {
    const runner = commandRunner([
      { stdout: "", code: 44 },
      { stdout: "", code: 44 },
    ]);
    const store = new KeychainStore(runner, DEVICE_ID);

    await expect(store.delete()).resolves.toBeUndefined();
    await expect(store.read()).resolves.toBeNull();

    expect(runner.run).toHaveBeenCalledTimes(2);
  });

  it("does not delete an index that points to another device", async () => {
    const otherDeviceId = "40000000-0000-0000-0000-000000000002";
    const runner = commandRunner([
      { stdout: "", code: 0 },
      { stdout: `${otherDeviceId}\n`, code: 0 },
    ]);
    const store = new KeychainStore(runner, DEVICE_ID);

    await store.delete();

    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(runner.run).not.toHaveBeenCalledWith(
      SECURITY,
      expect.arrayContaining([
        "delete-generic-password",
        "-a",
        CURRENT_DEVICE_ACCOUNT,
      ]),
    );
  });

  it("throws when Keychain rejects a delete", async () => {
    const store = new KeychainStore(
      commandRunner([{ stdout: "", code: 36 }]),
      DEVICE_ID,
    );

    await expect(store.delete()).rejects.toThrow(/exit code 36/i);
  });

  it("binds the instance to the account it saves", async () => {
    const runner = commandRunner([
      { stdout: "", code: 0 },
      { stdout: "", code: 0 },
      { stdout: "dt_secret\n", code: 0 },
    ]);
    const store = new KeychainStore(runner);

    await store.save(CREDENTIAL);

    await expect(store.read()).resolves.toEqual(CREDENTIAL);
  });

  it("does not use the current-device index for unbound reads", async () => {
    const runner = commandRunner([
      { stdout: `${DEVICE_ID}\n`, code: 0 },
    ]);
    const store = new KeychainStore(runner);

    await expect(store.read()).resolves.toBeNull();
    expect(runner.run).not.toHaveBeenCalled();
  });

  it("uses the current-device index for unbound recovery deletion", async () => {
    const runner = commandRunner([
      { stdout: `${DEVICE_ID}\n`, code: 0 },
      { stdout: "", code: 0 },
      { stdout: "", code: 0 },
    ]);
    const store = new KeychainStore(runner);

    await store.delete();

    expect(runner.run).toHaveBeenNthCalledWith(1, SECURITY, [
      "find-generic-password",
      "-s",
      SERVICE,
      "-a",
      CURRENT_DEVICE_ACCOUNT,
      "-w",
    ]);
    expect(runner.run).toHaveBeenNthCalledWith(2, SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      DEVICE_ID,
    ]);
    expect(runner.run).toHaveBeenNthCalledWith(3, SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      CURRENT_DEVICE_ACCOUNT,
    ]);
  });

  it("treats a missing current-device index as an idempotent unbound delete", async () => {
    const runner = commandRunner([{ stdout: "", code: 44 }]);
    const store = new KeychainStore(runner);

    await expect(store.delete()).resolves.toBeUndefined();
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  it("retains the recovery index when indexed credential deletion fails", async () => {
    const runner = commandRunner([
      { stdout: `${DEVICE_ID}\n`, code: 0 },
      { stdout: "", code: 36 },
    ]);
    const store = new KeychainStore(runner);

    await expect(store.delete()).rejects.toThrow(/exit code 36/i);
    expect(runner.run).toHaveBeenCalledTimes(2);
    expect(runner.run).not.toHaveBeenCalledWith(
      SECURITY,
      expect.arrayContaining([
        "delete-generic-password",
        "-a",
        CURRENT_DEVICE_ACCOUNT,
      ]),
    );
  });

  it("probes a distinct throwaway account and deletes it", async () => {
    const runner = commandRunner([
      { stdout: "", code: 0 },
      { stdout: "", code: 0 },
    ]);
    const store = new KeychainStore(runner);

    await expect(store.probe()).resolves.toBe(true);

    const addArguments = runner.run.mock.calls[0]?.[1];
    const deleteArguments = runner.run.mock.calls[1]?.[1];
    const probeAccount = addArguments?.[5];
    expect(probeAccount).toMatch(/^__probe__/);
    expect(probeAccount).not.toBe(DEVICE_ID);
    expect(deleteArguments?.[4]).toBe(probeAccount);
    expect(runner.run).toHaveBeenNthCalledWith(1, SECURITY, [
      "add-generic-password",
      "-U",
      "-s",
      SERVICE,
      "-a",
      expect.stringMatching(/^__probe__/),
      "-w",
      expect.any(String),
    ]);
    expect(runner.run).toHaveBeenNthCalledWith(2, SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      expect.stringMatching(/^__probe__/),
    ]);
  });

  it.each<[string, CommandResult[]]>([
    ["write", [{ stdout: "", code: 36 }]],
    [
      "cleanup",
      [
        { stdout: "", code: 0 },
        { stdout: "", code: 36 },
      ],
    ],
  ])("reports false when probe %s fails", async (_operation, results) => {
    const store = new KeychainStore(commandRunner(results));

    await expect(store.probe()).resolves.toBe(false);
  });
});
