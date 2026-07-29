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
  it("binds the Keychain store to config.deviceId after reading config", async () => {
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
      (options: {
        gatewayUrl: string;
        credentialStore: CredentialStore;
      }) => {
        events.push(`create gateway:${options.gatewayUrl}`);
        return { start };
      },
    );

    await startAgent({
      paths,
      runner,
      fileSystem: configuredFileSystem(events),
      createCredentialStore,
      createGatewayClient,
    });

    expect(createCredentialStore).toHaveBeenCalledWith(
      runner,
      config.deviceId,
    );
    expect(createGatewayClient).toHaveBeenCalledWith({
      gatewayUrl: config.gatewayUrl,
      credentialStore,
    });
    expect(events).toEqual([
      `exists:${paths.configFile}`,
      "read config",
      `bind store:${config.deviceId}`,
      `create gateway:${config.gatewayUrl}`,
      "start gateway",
    ]);
  });
});
