import { mkdtemp, readFile, rm, stat, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectorPaths } from "./paths";
import {
  nodeManagedFileSystem,
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

describe("managed file system", () => {
  const temporaryRoots: string[] = [];

  async function temporaryRoot(): Promise<string> {
    const root = await mkdtemp(path.join(os.tmpdir(), "meld-managed-fs-"));
    temporaryRoots.push(root);
    return root;
  }

  afterEach(async () => {
    await Promise.all(
      temporaryRoots
        .splice(0)
        .map((root) => rm(root, { recursive: true, force: true })),
    );
  });

  it("streams bytes into a private file only the owner can read", async () => {
    const root = await temporaryRoot();
    const target = path.join(root, "artifact.tar.gz");

    const handle = await nodeManagedFileSystem.openPrivateFile(target);
    await handle.write(Uint8Array.from([1, 2, 3]));
    await handle.write(Uint8Array.from([4]));
    await handle.close();

    await expect(readFile(target)).resolves.toEqual(
      Buffer.from([1, 2, 3, 4]),
    );
    const stats = await stat(target);
    expect(stats.mode & 0o777).toBe(0o600);
  });

  it("renames a path atomically over an existing one", async () => {
    const root = await temporaryRoot();
    const source = path.join(root, "source.txt");
    const destination = path.join(root, "destination.txt");
    await writeFile(source, "next", "utf8");
    await writeFile(destination, "previous", "utf8");

    await nodeManagedFileSystem.rename(source, destination);

    await expect(readFile(destination, "utf8")).resolves.toBe("next");
    await expect(nodeManagedFileSystem.exists(source)).resolves.toBe(false);
  });

  it("reads back the target of a symlink and reports a missing one", async () => {
    const root = await temporaryRoot();
    const target = path.join(root, "versions", "24.8.0");
    const link = path.join(root, "current");
    await nodeManagedFileSystem.makeDirectory(target);

    await nodeManagedFileSystem.createSymlink(target, link);

    await expect(nodeManagedFileSystem.readSymlink(link)).resolves.toBe(
      target,
    );
    await expect(
      nodeManagedFileSystem.readSymlink(path.join(root, "absent")),
    ).resolves.toBeUndefined();
  });

  it("reports no symlink target for a real directory", async () => {
    const root = await temporaryRoot();
    const directory = path.join(root, "plain");
    await nodeManagedFileSystem.makeDirectory(directory);

    await expect(
      nodeManagedFileSystem.readSymlink(directory),
    ).resolves.toBeUndefined();
  });
});
