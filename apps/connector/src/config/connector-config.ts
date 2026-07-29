import {
  access,
  copyFile,
  mkdir,
  readFile,
  rm,
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

export interface ConnectorFileSystem {
  exists(file: string): Promise<boolean>;
  readText(file: string): Promise<string>;
  writePrivateText(file: string, contents: string): Promise<void>;
  copyFile(source: string, destination: string): Promise<void>;
  makeDirectory(directory: string): Promise<void>;
  removeTree(target: string): Promise<void>;
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
    throw new Error(
      "Meld connector is not configured. Pair this device before starting the connector.",
    );
  }

  let value: unknown;
  try {
    value = JSON.parse(await fileSystem.readText(paths.configFile));
  } catch {
    throw new Error("Meld connector configuration is not valid JSON.");
  }

  const parsed = ConnectorConfigSchema.safeParse(value);
  if (!parsed.success) {
    throw new Error("Meld connector configuration is invalid.");
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
