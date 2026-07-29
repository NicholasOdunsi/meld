import { describe, expect, it, vi } from "vitest";
import { connectorPaths } from "./paths";
import {
  readConfig,
  writeConfig,
  type ConnectorFileSystem,
} from "./connector-config";

const paths = connectorPaths("/Users/ada");
const config = {
  gatewayUrl: "ws://127.0.0.1:8787/ws",
  deviceId: "00000000-0000-4000-8000-000000000123",
  requestedProvider: "codex" as const,
};

function fileSystemWith(contents?: string): ConnectorFileSystem {
  return {
    exists: vi.fn().mockResolvedValue(contents !== undefined),
    readText: vi.fn().mockResolvedValue(contents),
    writePrivateText: vi.fn().mockResolvedValue(undefined),
    copyFile: vi.fn().mockResolvedValue(undefined),
    makeDirectory: vi.fn().mockResolvedValue(undefined),
    removeTree: vi.fn().mockResolvedValue(undefined),
  };
}

describe("connector config", () => {
  it("writes only the non-secret connector fields", async () => {
    const fileSystem = fileSystemWith();

    await writeConfig(paths, config, fileSystem);

    expect(fileSystem.makeDirectory).toHaveBeenCalledWith(paths.root);
    expect(fileSystem.writePrivateText).toHaveBeenCalledWith(
      paths.configFile,
      `${JSON.stringify(config, null, 2)}\n`,
    );
  });

  it("refuses to write a future secret-like field", async () => {
    const fileSystem = fileSystemWith();
    const unsafeConfig = {
      ...config,
      deviceToken: "dt_must-not-reach-disk",
    };

    await expect(
      writeConfig(paths, unsafeConfig, fileSystem),
    ).rejects.toThrow(/secret-like configuration key.*deviceToken/i);
    expect(fileSystem.writePrivateText).not.toHaveBeenCalled();
  });

  it("reads and validates the persisted non-secret config", async () => {
    const fileSystem = fileSystemWith(JSON.stringify(config));

    await expect(readConfig(paths, fileSystem)).resolves.toEqual(config);
  });

  it("reports a useful configuration error when config is absent", async () => {
    const fileSystem = fileSystemWith();

    await expect(readConfig(paths, fileSystem)).rejects.toThrow(
      /connector is not configured/i,
    );
    expect(fileSystem.readText).not.toHaveBeenCalled();
  });
});
