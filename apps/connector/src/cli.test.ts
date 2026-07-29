import { describe, expect, it, vi } from "vitest";
import type { ConnectorFileSystem } from "./config/connector-config";
import { connectorPaths } from "./config/paths";
import type { LaunchAgentOperations } from "./cli";
import type { CommandRunner } from "./launchd/command-runner";
import type { CredentialStore } from "./pairing/credential-store";
import { runCli, type CliDependencies } from "./cli";

const paths = connectorPaths("/Users/ada");
const builtAgentEntry = "/workspace/apps/connector/dist/agent.mjs";
const gatewayUrl = "ws://127.0.0.1:8787/ws";
const deviceId = "00000000-0000-4000-8000-000000000123";
const token = "dt_top_secret";

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
});
