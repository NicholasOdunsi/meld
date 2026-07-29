import {
  mkdir,
  mkdtemp,
  rm,
  writeFile,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  nodeConnectorFileSystem,
  type ConnectorFileSystem,
} from "./config/connector-config";
import { connectorPaths } from "./config/paths";
import type { LaunchAgentOperations } from "./cli";
import {
  installLaunchAgent,
  isLaunchAgentLoaded,
  uninstallLaunchAgent,
} from "./launchd/launch-agent";
import type { CommandRunner } from "./launchd/command-runner";
import type { CredentialStore } from "./pairing/credential-store";
import {
  CURRENT_DEVICE_ACCOUNT,
  KeychainStore,
} from "./pairing/keychain-store";
import { runCli, type CliDependencies } from "./cli";

const paths = connectorPaths("/Users/ada");
const builtAgentEntry = "/workspace/apps/connector/dist/agent.mjs";
const gatewayUrl = "ws://127.0.0.1:8787/ws";
const deviceId = "00000000-0000-4000-8000-000000000123";
const token = "dt_top_secret";
const temporaryHomes: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryHomes
      .splice(0)
      .map((home) => rm(home, { recursive: true, force: true })),
  );
});

interface Harness {
  dependencies: CliDependencies;
  events: string[];
  output: string[];
  files: Map<string, string>;
  credentialStore: CredentialStore;
  launchAgent: LaunchAgentOperations;
  pair: ReturnType<typeof vi.fn>;
}

function harness(options: {
  bundleExists?: boolean;
  configured?: boolean;
  launchInstallError?: Error;
  launchUninstallError?: Error;
  credentialDeleteError?: Error;
  removeTreeError?: Error;
  loaded?: boolean;
} = {}): Harness {
  const events: string[] = [];
  const output: string[] = [];
  const files = new Map<string, string>();

  if (options.bundleExists ?? true) {
    files.set(builtAgentEntry, "bundled agent");
  }
  if (options.configured ?? false) {
    files.set(
      paths.configFile,
      JSON.stringify({
        gatewayUrl,
        deviceId,
        requestedProvider: "codex",
      }),
    );
  }

  const fileSystem: ConnectorFileSystem = {
    exists: vi.fn(async (file) => files.has(file)),
    readText: vi.fn(async (file) => {
      const contents = files.get(file);
      if (contents === undefined) {
        throw new Error(`missing ${file}`);
      }
      return contents;
    }),
    writePrivateText: vi.fn(async (file, contents) => {
      events.push("write config");
      files.set(file, contents);
    }),
    copyFile: vi.fn(async (source, destination) => {
      events.push("copy bundle");
      const contents = files.get(source);
      if (contents === undefined) {
        throw new Error(`missing ${source}`);
      }
      files.set(destination, contents);
    }),
    makeDirectory: vi.fn(async () => undefined),
    removeTree: vi.fn(async (target) => {
      events.push("remove directory");
      if (options.removeTreeError) {
        throw options.removeTreeError;
      }
      for (const file of [...files.keys()]) {
        if (file === target || file.startsWith(`${target}/`)) {
          files.delete(file);
        }
      }
    }),
  };
  const credentialStore: CredentialStore = {
    save: vi.fn(),
    read: vi.fn().mockResolvedValue({ deviceId, deviceToken: token }),
    delete: vi.fn(async () => {
      events.push("delete credential");
      if (options.credentialDeleteError) {
        throw options.credentialDeleteError;
      }
    }),
    probe: vi.fn(),
  };
  const pair = vi.fn(async () => {
    events.push("probe");
    events.push("redeem");
    events.push("save credential");
    return { deviceId, requestedProvider: "codex" as const };
  });
  const runner: CommandRunner = {
    run: vi.fn(),
  };
  const launchAgent: LaunchAgentOperations = {
    install: vi.fn(async () => {
      events.push("install LaunchAgent");
      if (options.launchInstallError) {
        throw options.launchInstallError;
      }
    }),
    uninstall: vi.fn(async () => {
      events.push("boot out agent");
      if (options.launchUninstallError) {
        throw options.launchUninstallError;
      }
    }),
    isLoaded: vi.fn().mockResolvedValue(options.loaded ?? true),
  };

  return {
    dependencies: {
      paths,
      builtAgentEntry,
      gatewayUrl,
      nodePath: "/usr/local/bin/node",
      runner,
      fileSystem,
      createCredentialStore: vi.fn(() => credentialStore),
      createPairingClient: vi.fn(() => ({ pair })),
      launchAgent,
      startForeground: vi.fn(),
      output: (line) => output.push(line),
    },
    events,
    output,
    files,
    credentialStore,
    launchAgent,
    pair,
  };
}

describe("connector CLI", () => {
  it("fails before redeeming when the built bundle is absent", async () => {
    const context = harness({ bundleExists: false });

    await expect(
      runCli(["pair", "--join", "ABCD-EFGH"], context.dependencies),
    ).rejects.toThrow(/pnpm --filter @meld\/connector build/);
    expect(context.pair).not.toHaveBeenCalled();
  });

  it("pairs, persists, copies, and installs in the load-bearing order", async () => {
    const context = harness();

    await runCli(
      ["pair", "--join", "ABCD-EFGH"],
      context.dependencies,
    );

    expect(context.events).toEqual([
      "probe",
      "redeem",
      "save credential",
      "write config",
      "copy bundle",
      "install LaunchAgent",
    ]);
    expect(context.files.get(paths.agentEntry)).toBe("bundled agent");
    expect(JSON.parse(context.files.get(paths.configFile) ?? "")).toEqual({
      gatewayUrl,
      deviceId,
      requestedProvider: "codex",
    });
  });

  it("keeps pairing successful when LaunchAgent installation fails", async () => {
    const context = harness({
      launchInstallError: new Error("launchctl unavailable"),
    });

    await expect(
      runCli(["pair", "--join", "ABCD-EFGH"], context.dependencies),
    ).resolves.toBeUndefined();

    const output = context.output.join("\n");
    expect(output).toMatch(/paired successfully/i);
    expect(output).toMatch(/cli start/i);
    expect(output).toMatch(/foreground/i);
  });

  it("prints non-secret status fields and loaded state", async () => {
    const context = harness({ configured: true, loaded: true });

    await runCli(["status"], context.dependencies);

    const output = context.output.join("\n");
    expect(output).toContain(deviceId);
    expect(output).toContain("codex");
    expect(output).toContain(gatewayUrl);
    expect(output).toMatch(/loaded:\s*yes/i);
    expect(output).not.toContain(token);
    expect(output).not.toContain("dt_");
    expect(context.credentialStore.read).not.toHaveBeenCalled();
  });

  it("starts the agent in the foreground", async () => {
    const context = harness({ configured: true });

    await runCli(["start"], context.dependencies);

    expect(context.dependencies.startForeground).toHaveBeenCalledOnce();
    expect(context.output.join("\n")).toMatch(/foreground/i);
  });

  it("uninstalls all local state and names the server-side revoke step", async () => {
    const context = harness({ configured: true });

    await runCli(["uninstall"], context.dependencies);

    expect(context.events).toEqual([
      "boot out agent",
      "delete credential",
      "remove directory",
    ]);
    expect(context.dependencies.createCredentialStore).toHaveBeenCalledWith(
      deviceId,
    );
    expect(context.output.join("\n")).toMatch(
      new RegExp(`revoke.*${deviceId}.*web UI`, "i"),
    );
  });

  it("succeeds when nothing is installed", async () => {
    const context = harness({ bundleExists: false, configured: false });

    await expect(
      runCli(["uninstall"], context.dependencies),
    ).resolves.toBeUndefined();
    expect(context.events).toEqual([
      "boot out agent",
      "delete credential",
      "remove directory",
    ]);
    expect(context.output.join("\n")).toMatch(/uninstalled/i);
  });

  it("attempts every cleanup stage before reporting operational failures", async () => {
    const context = harness({
      bundleExists: false,
      configured: false,
      launchUninstallError: new Error("launchctl denied"),
      credentialDeleteError: new Error("Keychain locked"),
      removeTreeError: new Error("filesystem denied"),
    });

    await expect(
      runCli(["uninstall"], context.dependencies),
    ).rejects.toThrow(
      /LaunchAgent.*launchctl denied.*credential.*Keychain locked.*Application Support.*filesystem denied/i,
    );
    expect(context.events).toEqual([
      "boot out agent",
      "delete credential",
      "remove directory",
    ]);
  });
});

interface ProductionUninstallHarness {
  dependencies: CliDependencies;
  paths: ReturnType<typeof connectorPaths>;
  output: string[];
  runner: CommandRunner;
}

async function productionUninstallHarness(options: {
  configContents?: string;
  createRoot?: boolean;
  createPlist?: boolean;
  indexedDeviceId?: string;
} = {}): Promise<ProductionUninstallHarness> {
  const home = await mkdtemp(
    path.join(os.tmpdir(), "meld-cli-uninstall-"),
  );
  temporaryHomes.push(home);
  const realPaths = connectorPaths(home);

  if (options.createRoot) {
    await mkdir(realPaths.root, { recursive: true });
    await writeFile(path.join(realPaths.root, "state"), "installed");
  }
  if (options.configContents !== undefined) {
    await mkdir(realPaths.root, { recursive: true });
    await writeFile(realPaths.configFile, options.configContents);
  }
  if (options.createPlist) {
    await mkdir(path.dirname(realPaths.plistFile), {
      recursive: true,
    });
    await writeFile(realPaths.plistFile, "plist");
  }

  let indexedDeviceId = options.indexedDeviceId;
  const runner: CommandRunner = {
    run: vi.fn(async (command, args) => {
      if (command === "launchctl") {
        return {
          stdout: "",
          stderr: "No such process",
          code: 3,
        };
      }
      if (command !== "/usr/bin/security") {
        throw new Error(`unexpected command ${command}`);
      }

      const account = args[args.indexOf("-a") + 1];
      if (
        args[0] === "find-generic-password" &&
        account === CURRENT_DEVICE_ACCOUNT
      ) {
        return indexedDeviceId === undefined
          ? { stdout: "", code: 44 }
          : { stdout: `${indexedDeviceId}\n`, code: 0 };
      }
      if (args[0] === "delete-generic-password") {
        if (account === CURRENT_DEVICE_ACCOUNT) {
          indexedDeviceId = undefined;
          return { stdout: "", code: 0 };
        }
        if (account === options.indexedDeviceId) {
          return { stdout: "", code: 0 };
        }
        return { stdout: "", code: 44 };
      }

      throw new Error(`unexpected security operation ${args[0]}`);
    }),
  };
  const output: string[] = [];
  const dependencies: CliDependencies = {
    paths: realPaths,
    builtAgentEntry: path.join(home, "dist", "agent.mjs"),
    gatewayUrl,
    nodePath: process.execPath,
    runner,
    fileSystem: nodeConnectorFileSystem,
    createCredentialStore: (boundDeviceId) =>
      new KeychainStore(runner, boundDeviceId),
    createPairingClient: vi.fn(),
    launchAgent: {
      install: installLaunchAgent,
      uninstall: uninstallLaunchAgent,
      isLoaded: isLaunchAgentLoaded,
    },
    startForeground: vi.fn(),
    output: (line) => output.push(line),
  };

  return { dependencies, paths: realPaths, output, runner };
}

describe("production uninstall recovery", () => {
  it("is idempotent when no local installation exists", async () => {
    const context = await productionUninstallHarness();

    await expect(
      runCli(["uninstall"], context.dependencies),
    ).resolves.toBeUndefined();

    await expect(
      nodeConnectorFileSystem.exists(context.paths.root),
    ).resolves.toBe(false);
    await expect(
      nodeConnectorFileSystem.exists(context.paths.plistFile),
    ).resolves.toBe(false);
    expect(context.output.join("\n")).toMatch(/revoke.*web UI/i);
  });

  it("recovers an indexed credential when config is missing", async () => {
    const context = await productionUninstallHarness({
      createRoot: true,
      createPlist: true,
      indexedDeviceId: deviceId,
    });

    await runCli(["uninstall"], context.dependencies);

    expect(context.runner.run).toHaveBeenCalledWith(
      "/usr/bin/security",
      expect.arrayContaining([
        "delete-generic-password",
        "-a",
        deviceId,
      ]),
    );
    expect(context.runner.run).toHaveBeenCalledWith(
      "/usr/bin/security",
      expect.arrayContaining([
        "delete-generic-password",
        "-a",
        CURRENT_DEVICE_ACCOUNT,
      ]),
    );
    await expect(
      nodeConnectorFileSystem.exists(context.paths.root),
    ).resolves.toBe(false);
    await expect(
      nodeConnectorFileSystem.exists(context.paths.plistFile),
    ).resolves.toBe(false);
  });

  it("uses recovery deletion and removes local files when config is invalid", async () => {
    const context = await productionUninstallHarness({
      configContents: "{ invalid",
      createPlist: true,
      indexedDeviceId: deviceId,
    });

    await expect(
      runCli(["uninstall"], context.dependencies),
    ).resolves.toBeUndefined();

    await expect(
      nodeConnectorFileSystem.exists(context.paths.root),
    ).resolves.toBe(false);
    await expect(
      nodeConnectorFileSystem.exists(context.paths.plistFile),
    ).resolves.toBe(false);
    expect(context.output.join("\n")).not.toContain(deviceId);
    expect(context.output.join("\n")).toMatch(/revoke.*web UI/i);
  });
});
