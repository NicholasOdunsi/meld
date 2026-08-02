import {
  access,
  copyFile,
  lstat,
  mkdir,
  open,
  readFile,
  readlink,
  rename,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { ProviderSchema } from "@meld/contracts";
import { z } from "zod";
import type { ConnectorPaths } from "./paths";

const SECRET_LIKE_KEY =
  /(?:secret|token|password|credential|api[_-]?key|private[_-]?key)/i;

const ConnectorConfigSchema = z
  .object({
    gatewayUrl: z.string().refine((value) => {
      try {
        const url = new URL(value);
        return url.protocol === "ws:" || url.protocol === "wss:";
      } catch {
        return false;
      }
    }, "gatewayUrl must use ws:// or wss://"),
    deviceId: z.uuid(),
    requestedProvider: ProviderSchema,
  })
  .strict();

export type ConnectorConfig = z.infer<typeof ConnectorConfigSchema>;

export class ConnectorConfigError extends Error {
  override readonly name = "ConnectorConfigError";
}

export interface ConnectorFileSystem {
  exists(file: string): Promise<boolean>;
  readText(file: string): Promise<string>;
  writePrivateText(file: string, contents: string): Promise<void>;
  copyFile(source: string, destination: string): Promise<void>;
  makeDirectory(directory: string): Promise<void>;
  removeTree(target: string): Promise<void>;
}

/**
 * A single staged artifact being written with owner-only permissions. The
 * downloader streams into it so a multi-megabyte archive never has to be held
 * in memory.
 */
export interface PrivateFileHandle {
  write(chunk: Uint8Array): Promise<void>;
  close(): Promise<void>;
}

/**
 * The extra file-system operations the managed private runtime needs on top of
 * {@link ConnectorFileSystem}: streamed private writes plus the rename and
 * symlink primitives that make an installation atomic.
 */
export interface ManagedFileSystem extends ConnectorFileSystem {
  openPrivateFile(file: string): Promise<PrivateFileHandle>;
  rename(source: string, destination: string): Promise<void>;
  createSymlink(target: string, linkPath: string): Promise<void>;
  readSymlink(linkPath: string): Promise<string | undefined>;
}

function isMissing(error: unknown): boolean {
  return (
    error instanceof Error &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

export const nodeConnectorFileSystem: ConnectorFileSystem = {
  async exists(file) {
    try {
      await access(file);
      return true;
    } catch (error) {
      if (isMissing(error)) {
        return false;
      }
      throw error;
    }
  },
  readText(file) {
    return readFile(file, "utf8");
  },
  async writePrivateText(file, contents) {
    await writeFile(file, contents, {
      encoding: "utf8",
      mode: 0o600,
    });
  },
  async copyFile(source, destination) {
    await copyFile(source, destination);
  },
  async makeDirectory(directory) {
    await mkdir(directory, { recursive: true });
  },
  async removeTree(target) {
    await rm(target, { recursive: true, force: true });
  },
};

export const nodeManagedFileSystem: ManagedFileSystem = {
  ...nodeConnectorFileSystem,
  async openPrivateFile(file) {
    const handle = await open(file, "w", 0o600);
    // `open` only applies the mode when it creates the file, so re-assert it in
    // case a staged artifact from an earlier attempt is still present.
    await handle.chmod(0o600);
    return {
      async write(chunk) {
        await handle.write(chunk);
      },
      async close() {
        await handle.close();
      },
    };
  },
  async rename(source, destination) {
    await rename(source, destination);
  },
  async createSymlink(target, linkPath) {
    await symlink(target, linkPath);
  },
  async readSymlink(linkPath) {
    try {
      const stats = await lstat(linkPath);
      if (!stats.isSymbolicLink()) {
        return undefined;
      }
      return await readlink(linkPath);
    } catch (error) {
      if (isMissing(error)) {
        return undefined;
      }
      throw error;
    }
  },
};

function assertNoSecretLikeKeys(
  value: unknown,
  location = "config",
): void {
  if (Array.isArray(value)) {
    value.forEach((entry, index) => {
      assertNoSecretLikeKeys(entry, `${location}[${index}]`);
    });
    return;
  }
  if (value === null || typeof value !== "object") {
    return;
  }

  for (const [key, child] of Object.entries(value)) {
    if (SECRET_LIKE_KEY.test(key)) {
      throw new Error(
        `Refusing to write secret-like configuration key ${location}.${key}.`,
      );
    }
    assertNoSecretLikeKeys(child, `${location}.${key}`);
  }
}

export async function readConfig(
  paths: ConnectorPaths,
  fileSystem: ConnectorFileSystem = nodeConnectorFileSystem,
): Promise<ConnectorConfig> {
  if (!(await fileSystem.exists(paths.configFile))) {
    throw new ConnectorConfigError(
      "Meld connector is not configured. Pair this device before starting the connector.",
    );
  }

  const contents = await fileSystem.readText(paths.configFile);
  let value: unknown;
  try {
    value = JSON.parse(contents);
  } catch {
    throw new ConnectorConfigError(
      "Meld connector configuration is not valid JSON.",
    );
  }

  const parsed = ConnectorConfigSchema.safeParse(value);
  if (!parsed.success) {
    throw new ConnectorConfigError(
      "Meld connector configuration is invalid.",
    );
  }

  return parsed.data;
}

export async function writeConfig(
  paths: ConnectorPaths,
  config: ConnectorConfig,
  fileSystem: ConnectorFileSystem = nodeConnectorFileSystem,
): Promise<void> {
  assertNoSecretLikeKeys(config);
  const parsed = ConnectorConfigSchema.parse(config);

  await fileSystem.makeDirectory(paths.root);
  await fileSystem.writePrivateText(
    paths.configFile,
    `${JSON.stringify(parsed, null, 2)}\n`,
  );
}
