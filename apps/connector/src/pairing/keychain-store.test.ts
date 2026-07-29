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
const PREVIOUS_DEVICE_ID =
  "40000000-0000-0000-0000-000000000002";
const PREVIOUS_TOKEN = "previous_secret_sentinel";
const RUNNER_OUTPUT = "runner_output_sentinel";
const RUNNER_CAUSE = "runner_cause_sentinel";

type KeychainFaultMode =
  | "mutate-then-throw"
  | "nonzero-after-mutation"
  | "nonzero-without-mutation";

interface KeychainFault {
  operation: number;
  mode: KeychainFaultMode;
}

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

function statefulKeychain(
  faults: KeychainFault[] = [],
  initialItems: Iterable<readonly [string, string]> = [
    [CURRENT_DEVICE_ACCOUNT, PREVIOUS_DEVICE_ID],
    [PREVIOUS_DEVICE_ID, PREVIOUS_TOKEN],
  ],
) {
  const items = new Map<string, string>(initialItems);
  const operations: Array<{
    number: number;
    operation: string;
    account: string;
  }> = [];
  let operationNumber = 0;

  function execute(
    operation: string,
    account: string,
    args: string[],
  ): CommandResult {
    if (operation === "find-generic-password") {
      const value = items.get(account);
      return value === undefined
        ? { stdout: "", code: 44 }
        : { stdout: `${value}\n`, code: 0 };
    }
    if (operation === "add-generic-password") {
      items.set(account, args[args.indexOf("-w") + 1] ?? "");
      return { stdout: "", code: 0 };
    }
    if (operation === "delete-generic-password") {
      if (!items.has(account)) {
        return { stdout: "", code: 44 };
      }
      items.delete(account);
      return { stdout: "", code: 0 };
    }
    throw new Error(`Unexpected security operation ${operation}`);
  }

  const run = vi.fn<CommandRunner["run"]>(
    async (_command, args) => {
      operationNumber += 1;
      const operation = args[0] ?? "";
      const account = args[args.indexOf("-a") + 1] ?? "";
      operations.push({
        number: operationNumber,
        operation,
        account,
      });
      const fault = faults.find(
        (candidate) => candidate.operation === operationNumber,
      );
      if (fault?.mode === "nonzero-without-mutation") {
        return {
          stdout: RUNNER_OUTPUT,
          stderr: RUNNER_OUTPUT,
          code: 36,
        };
      }
      const result = execute(operation, account, args);
      if (fault?.mode === "mutate-then-throw") {
        throw new Error(RUNNER_CAUSE);
      }
      if (fault?.mode === "nonzero-after-mutation") {
        return {
          stdout: RUNNER_OUTPUT,
          stderr: RUNNER_OUTPUT,
          code: 36,
        };
      }
      return result;
    },
  );
  return { run, items, operations };
}

describe("keychain credential store", () => {
  it("saves the device token under the device ID account", async () => {
    const runner = commandRunner([{ stdout: "", code: 44 }]);
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
    expect(runner.run).toHaveBeenNthCalledWith(3, SECURITY, [
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

  it("rolls back the index and credential when the first current-device index cannot be written", async () => {
    const runner = commandRunner([
      { stdout: "", code: 44 },
      { stdout: "", code: 0 },
      { stdout: "", code: 36 },
      { stdout: "", code: 0 },
      { stdout: "", code: 0 },
    ]);
    const store = new KeychainStore(runner);

    await expect(store.save(CREDENTIAL)).rejects.toThrow(
      /current-device index.*exit code 36/i,
    );
    expect(runner.run).toHaveBeenNthCalledWith(4, SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      CURRENT_DEVICE_ACCOUNT,
    ]);
    expect(runner.run).toHaveBeenNthCalledWith(5, SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      DEVICE_ID,
    ]);
    await expect(store.read()).resolves.toBeNull();
  });

  it("rolls back the index and credential when the first current-device index write throws", async () => {
    const run = vi
      .fn<CommandRunner["run"]>()
      .mockResolvedValueOnce({ stdout: "", code: 44 })
      .mockResolvedValueOnce({ stdout: "", code: 0 })
      .mockRejectedValueOnce(new Error("Keychain unavailable"))
      .mockResolvedValueOnce({ stdout: "", code: 0 })
      .mockResolvedValueOnce({ stdout: "", code: 0 });
    const store = new KeychainStore({ run });

    await expect(store.save(CREDENTIAL)).rejects.toThrow(
      /current-device index save failed/i,
    );
    expect(run).toHaveBeenNthCalledWith(4, SECURITY, [
      "delete-generic-password",
      "-s",
      SERVICE,
      "-a",
      CURRENT_DEVICE_ACCOUNT,
    ]);
    expect(run).toHaveBeenNthCalledWith(5, SECURITY, [
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
      { stdout: "", code: 44 },
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

  it("removes the previously indexed credential after a successful re-pair", async () => {
    const runner = statefulKeychain();
    const store = new KeychainStore(runner);

    await store.save(CREDENTIAL);

    expect(runner.items).toEqual(
      new Map([
        [CURRENT_DEVICE_ACCOUNT, DEVICE_ID],
        [DEVICE_ID, CREDENTIAL.deviceToken],
      ]),
    );
  });

  it("removes a new secret whose initial save mutates before throwing", async () => {
    const runner = statefulKeychain([
      { operation: 3, mode: "mutate-then-throw" },
    ]);
    const store = new KeychainStore(runner, PREVIOUS_DEVICE_ID);

    const error = await store
      .save(CREDENTIAL)
      .catch((cause) => cause);
    const exposed = String(error);

    expect(exposed).toMatch(/Keychain save failed/i);
    expect(exposed).not.toContain(CREDENTIAL.deviceToken);
    expect(exposed).not.toContain(PREVIOUS_TOKEN);
    expect(exposed).not.toContain(RUNNER_OUTPUT);
    expect(exposed).not.toContain(RUNNER_CAUSE);
    expect(runner.items).toEqual(
      new Map([
        [CURRENT_DEVICE_ACCOUNT, PREVIOUS_DEVICE_ID],
        [PREVIOUS_DEVICE_ID, PREVIOUS_TOKEN],
      ]),
    );
    await expect(store.read()).resolves.toEqual({
      deviceId: PREVIOUS_DEVICE_ID,
      deviceToken: PREVIOUS_TOKEN,
    });
  });

  it.each<KeychainFaultMode>([
    "mutate-then-throw",
    "nonzero-without-mutation",
  ])(
    "restores the old state when the index switch fails via %s",
    async (mode) => {
      const runner = statefulKeychain([
        { operation: 4, mode },
      ]);
      const store = new KeychainStore(
        runner,
        PREVIOUS_DEVICE_ID,
      );

      await expect(store.save(CREDENTIAL)).rejects.toThrow(
        /current-device index save/i,
      );

      expect(runner.items).toEqual(
        new Map([
          [CURRENT_DEVICE_ACCOUNT, PREVIOUS_DEVICE_ID],
          [PREVIOUS_DEVICE_ID, PREVIOUS_TOKEN],
        ]),
      );
      await expect(store.read()).resolves.toEqual({
        deviceId: PREVIOUS_DEVICE_ID,
        deviceToken: PREVIOUS_TOKEN,
      });
    },
  );

  it("removes an ambiguously written index and token after a first-pair index failure", async () => {
    const runner = statefulKeychain(
      [{ operation: 3, mode: "mutate-then-throw" }],
      [],
    );
    const store = new KeychainStore(runner);

    const error = await store
      .save(CREDENTIAL)
      .catch((cause) => cause);
    const exposed = String(error);

    expect(exposed).toMatch(/current-device index save failed/i);
    expect(exposed).not.toContain(CREDENTIAL.deviceToken);
    expect(exposed).not.toContain(RUNNER_OUTPUT);
    expect(exposed).not.toContain(RUNNER_CAUSE);
    expect(runner.operations.slice(-2)).toEqual([
      {
        number: 4,
        operation: "delete-generic-password",
        account: CURRENT_DEVICE_ACCOUNT,
      },
      {
        number: 5,
        operation: "delete-generic-password",
        account: DEVICE_ID,
      },
    ]);
    expect(runner.items).toEqual(new Map());
    await expect(store.read()).resolves.toBeNull();
  });

  it("reports incomplete first-pair cleanup but still removes the token when index removal fails", async () => {
    const runner = statefulKeychain(
      [
        { operation: 3, mode: "mutate-then-throw" },
        {
          operation: 4,
          mode: "nonzero-without-mutation",
        },
      ],
      [],
    );
    const store = new KeychainStore(runner);

    const error = await store
      .save(CREDENTIAL)
      .catch((cause) => cause);
    const exposed = String(error);

    expect(exposed).toMatch(/cleanup is incomplete/i);
    expect(exposed).toContain("current-device index removal");
    expect(exposed).not.toContain(CREDENTIAL.deviceToken);
    expect(exposed).not.toContain(RUNNER_OUTPUT);
    expect(exposed).not.toContain(RUNNER_CAUSE);
    expect(runner.operations.at(-1)).toEqual({
      number: 5,
      operation: "delete-generic-password",
      account: DEVICE_ID,
    });
    expect(runner.items).toEqual(
      new Map([[CURRENT_DEVICE_ACCOUNT, DEVICE_ID]]),
    );
  });

  it.each<KeychainFaultMode>([
    "mutate-then-throw",
    "nonzero-without-mutation",
  ])(
    "restores the old state when old-secret deletion fails via %s",
    async (mode) => {
      const runner = statefulKeychain([
        { operation: 5, mode },
      ]);
      const store = new KeychainStore(
        runner,
        PREVIOUS_DEVICE_ID,
      );

      await expect(store.save(CREDENTIAL)).rejects.toThrow(
        /previous credential cleanup failed/i,
      );

      expect(runner.items).toEqual(
        new Map([
          [CURRENT_DEVICE_ACCOUNT, PREVIOUS_DEVICE_ID],
          [PREVIOUS_DEVICE_ID, PREVIOUS_TOKEN],
        ]),
      );
      await expect(store.read()).resolves.toEqual({
        deviceId: PREVIOUS_DEVICE_ID,
        deviceToken: PREVIOUS_TOKEN,
      });
    },
  );

  it.each([
    {
      failedRestore: "previous credential restore",
      operation: 6,
      expectedItems: new Map([
        [CURRENT_DEVICE_ACCOUNT, PREVIOUS_DEVICE_ID],
      ]),
    },
    {
      failedRestore: "current-device index restore",
      operation: 7,
      expectedItems: new Map([
        [CURRENT_DEVICE_ACCOUNT, DEVICE_ID],
        [PREVIOUS_DEVICE_ID, PREVIOUS_TOKEN],
      ]),
    },
  ])(
    "reports incomplete cleanup and continues after $failedRestore returns nonzero",
    async ({ failedRestore, operation, expectedItems }) => {
      const runner = statefulKeychain([
        { operation: 5, mode: "mutate-then-throw" },
        {
          operation,
          mode: "nonzero-without-mutation",
        },
      ]);
      const store = new KeychainStore(runner);

      const error = await store
        .save(CREDENTIAL)
        .catch((cause) => cause);
      const exposed = String(error);

      expect(exposed).toMatch(/cleanup is incomplete/i);
      expect(exposed).toContain(failedRestore);
      expect(exposed).not.toContain(CREDENTIAL.deviceToken);
      expect(exposed).not.toContain(PREVIOUS_TOKEN);
      expect(exposed).not.toContain(RUNNER_OUTPUT);
      expect(exposed).not.toContain(RUNNER_CAUSE);
      expect(runner.operations.slice(-3)).toEqual([
        {
          number: 6,
          operation: "add-generic-password",
          account: PREVIOUS_DEVICE_ID,
        },
        {
          number: 7,
          operation: "add-generic-password",
          account: CURRENT_DEVICE_ACCOUNT,
        },
        {
          number: 8,
          operation: "delete-generic-password",
          account: DEVICE_ID,
        },
      ]);
      expect(runner.items).toEqual(expectedItems);
    },
  );

  it("reports incomplete cleanup when a mutated initial save cannot be removed", async () => {
    const runner = statefulKeychain([
      { operation: 3, mode: "mutate-then-throw" },
      {
        operation: 4,
        mode: "nonzero-without-mutation",
      },
    ]);
    const store = new KeychainStore(runner);

    const error = await store.save(CREDENTIAL).catch((cause) => cause);
    const exposed = String(error);

    expect(exposed).toMatch(/cleanup is incomplete/i);
    expect(exposed).not.toContain(CREDENTIAL.deviceToken);
    expect(exposed).not.toContain(PREVIOUS_TOKEN);
    expect(exposed).not.toContain(RUNNER_OUTPUT);
    expect(exposed).not.toContain(RUNNER_CAUSE);
    expect(runner.items).toEqual(
      new Map([
        [CURRENT_DEVICE_ACCOUNT, PREVIOUS_DEVICE_ID],
        [PREVIOUS_DEVICE_ID, PREVIOUS_TOKEN],
        [DEVICE_ID, CREDENTIAL.deviceToken],
      ]),
    );
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

  it.each<KeychainFaultMode>([
    "mutate-then-throw",
    "nonzero-after-mutation",
  ])(
    "removes the exact probe account when its write fails via %s",
    async (mode) => {
      const runner = statefulKeychain(
        [{ operation: 1, mode }],
        [],
      );
      const store = new KeychainStore(runner);

      await expect(store.probe()).resolves.toBe(false);

      const probeAccount = runner.operations[0]?.account;
      expect(probeAccount).toMatch(/^__probe__:/);
      expect(runner.operations).toEqual([
        {
          number: 1,
          operation: "add-generic-password",
          account: probeAccount,
        },
        {
          number: 2,
          operation: "delete-generic-password",
          account: probeAccount,
        },
      ]);
      expect(runner.items).toEqual(new Map());
    },
  );

  it("returns a secret-safe false result when ambiguous probe cleanup also fails", async () => {
    const runner = statefulKeychain(
      [
        { operation: 1, mode: "mutate-then-throw" },
        {
          operation: 2,
          mode: "nonzero-without-mutation",
        },
      ],
      [],
    );
    const store = new KeychainStore(runner);

    const result = await store.probe();
    const probeAccount = runner.operations[0]?.account;
    const probeSecret = runner.items.get(probeAccount ?? "");

    expect(result).toBe(false);
    expect(runner.operations[1]).toEqual({
      number: 2,
      operation: "delete-generic-password",
      account: probeAccount,
    });
    expect(probeSecret).toEqual(expect.any(String));
    expect(probeSecret).not.toBe("");
    expect(String(result)).not.toContain(probeSecret ?? "");
    expect(String(result)).not.toContain(RUNNER_OUTPUT);
    expect(String(result)).not.toContain(RUNNER_CAUSE);
  });
});
