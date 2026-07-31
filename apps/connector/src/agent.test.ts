import { describe, expect, it, vi } from "vitest";
import type { ConnectorFileSystem } from "./config/connector-config";
import { connectorPaths } from "./config/paths";
import type { CommandRunner } from "./launchd/command-runner";
import type { CredentialStore } from "./pairing/credential-store";
import { startAgent } from "./agent";

const paths = connectorPaths("/Users/ada");
const config = {
  gatewayUrl: "ws://127.0.0.1:8787/ws",
  deviceId: "00000000-0000-4000-8000-000000000123",
  requestedProvider: "claude",
};

function configuredFileSystem(events: string[]): ConnectorFileSystem {
  return {
    exists: vi.fn(async (file) => {
      events.push(`exists:${file}`);
      return file === paths.configFile;
    }),
    readText: vi.fn(async () => {
      events.push("read config");
      return JSON.stringify(config);
    }),
    writePrivateText: vi.fn(),
    copyFile: vi.fn(),
    makeDirectory: vi.fn(),
    removeTree: vi.fn(),
  };
}

describe("background agent", () => {
  it("binds the credential and selected provider after reading config", async () => {
    const events: string[] = [];
    const runner: CommandRunner = {
      run: vi.fn(),
    };
    const credentialStore: CredentialStore = {
      save: vi.fn(),
      read: vi.fn(),
      delete: vi.fn(),
      probe: vi.fn(),
    };
    const start = vi.fn(async () => {
      events.push("start gateway");
    });
    const createCredentialStore = vi.fn(
      (_runner: CommandRunner, deviceId: string) => {
        events.push(`bind store:${deviceId}`);
        return credentialStore;
      },
    );
    const createGatewayClient = vi.fn(
      (options: { gatewayUrl: string }) => {
        events.push(`create gateway:${options.gatewayUrl}`);
        return { start };
      },
    );
    const sweepAbandonedWorkspaces = vi.fn(async () => {
      events.push("sweep workspaces");
      return [];
    });

    await startAgent({
      paths,
      runner,
      fileSystem: configuredFileSystem(events),
      createCredentialStore,
      createGatewayClient,
      sweepAbandonedWorkspaces,
    });

    expect(createCredentialStore).toHaveBeenCalledWith(
      runner,
      config.deviceId,
    );
    expect(sweepAbandonedWorkspaces).toHaveBeenCalledWith(paths);
    expect(createGatewayClient).toHaveBeenCalledWith({
      gatewayUrl: config.gatewayUrl,
      credentialStore,
      requestedProvider: "claude",
      createProviderSetup: expect.any(Function),
      createTaskExecutor: expect.any(Function),
      detectProviders: expect.any(Function),
      onTerminal: expect.any(Function),
    });
    expect(events).toEqual([
      `exists:${paths.configFile}`,
      "read config",
      `bind store:${config.deviceId}`,
      "sweep workspaces",
      `create gateway:${config.gatewayUrl}`,
      "start gateway",
    ]);
  });

  it("emits an actionable diagnostic for terminal authentication", async () => {
    const diagnostics: string[] = [];
    let terminal: ((reason: string) => void) | undefined;

    await startAgent({
      paths,
      runner: { run: vi.fn() },
      fileSystem: configuredFileSystem([]),
      createCredentialStore: () => ({
        save: vi.fn(),
        read: vi.fn(),
        delete: vi.fn(),
        probe: vi.fn(),
      }),
      createGatewayClient: (options) => {
        terminal = options.onTerminal;
        return { start: vi.fn() };
      },
      sweepAbandonedWorkspaces: async () => [],
      diagnostic: (line) => diagnostics.push(line),
    });

    terminal?.("re-pair required");

    expect(diagnostics).toEqual([
      "Meld connector stopped: re-pair required.",
    ]);
  });
});
