import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import {
  nodeConnectorFileSystem,
  readConfig,
  writeConfig,
  type ConnectorFileSystem,
} from "./config/connector-config";
import { connectorPaths, type ConnectorPaths } from "./config/paths";
import { startAgent } from "./agent";
import {
  installLaunchAgent,
  isLaunchAgentLoaded,
  uninstallLaunchAgent,
} from "./launchd/launch-agent";
import {
  nodeCommandRunner,
  type CommandRunner,
} from "./launchd/command-runner";
import type { CredentialStore } from "./pairing/credential-store";
import { KeychainStore } from "./pairing/keychain-store";
import {
  PairingClient,
  type PairingResult,
} from "./pairing/pairing-client";

const BUILD_COMMAND = "pnpm --filter @meld/connector build";
const DEFAULT_APP_URL = "http://127.0.0.1:3000";
const DEFAULT_GATEWAY_URL = "ws://127.0.0.1:8787/ws";

interface PairingClientLike {
  pair(code: string): Promise<PairingResult>;
}

export interface LaunchAgentOperations {
  install(
    paths: ConnectorPaths,
    nodePath: string,
    runner: CommandRunner,
  ): Promise<void>;
  uninstall(
    paths: ConnectorPaths,
    runner: CommandRunner,
  ): Promise<void>;
  isLoaded(
    paths: ConnectorPaths,
    runner: CommandRunner,
  ): Promise<boolean>;
}

export interface CliDependencies {
  paths: ConnectorPaths;
  builtAgentEntry: string;
  gatewayUrl: string;
  nodePath: string;
  runner: CommandRunner;
  fileSystem: ConnectorFileSystem;
  createCredentialStore(deviceId?: string): CredentialStore;
  createPairingClient(
    credentialStore: CredentialStore,
  ): PairingClientLike;
  launchAgent: LaunchAgentOperations;
  startForeground(): Promise<void>;
  output(line: string): void;
}

function runtimeDependencies(): CliDependencies {
  const paths = connectorPaths(homedir());
  const runner = nodeCommandRunner;
  const fileSystem = nodeConnectorFileSystem;
  const appUrl = process.env.MELD_APP_URL ?? DEFAULT_APP_URL;
  const gatewayUrl =
    process.env.MELD_GATEWAY_URL ?? DEFAULT_GATEWAY_URL;

  return {
    paths,
    builtAgentEntry: fileURLToPath(
      new URL("../dist/agent.mjs", import.meta.url),
    ),
    gatewayUrl,
    nodePath: process.execPath,
    runner,
    fileSystem,
    createCredentialStore: (deviceId) =>
      new KeychainStore(runner, deviceId),
    createPairingClient: (credentialStore) =>
      new PairingClient({
        baseUrl: appUrl,
        credentialStore,
        fetch: globalThis.fetch,
      }),
    launchAgent: {
      install: installLaunchAgent,
      uninstall: uninstallLaunchAgent,
      isLoaded: isLaunchAgentLoaded,
    },
    startForeground: async () => {
      await startAgent({ paths, runner, fileSystem });
    },
    output: console.log,
  };
}

function pairingCode(argv: string[]): string {
  if (argv.length !== 3 || argv[1] !== "--join" || !argv[2]) {
    throw new Error("Usage: cli pair --join <code>");
  }
  return argv[2];
}

async function pair(
  argv: string[],
  dependencies: CliDependencies,
): Promise<void> {
  const code = pairingCode(argv);
  if (
    !(await dependencies.fileSystem.exists(
      dependencies.builtAgentEntry,
    ))
  ) {
    throw new Error(
      `The connector bundle is missing. Run \`${BUILD_COMMAND}\` before pairing.`,
    );
  }

  const credentialStore = dependencies.createCredentialStore();
  const client = dependencies.createPairingClient(credentialStore);
  const result = await client.pair(code);

  await writeConfig(
    dependencies.paths,
    {
      gatewayUrl: dependencies.gatewayUrl,
      deviceId: result.deviceId,
      requestedProvider: result.requestedProvider,
    },
    dependencies.fileSystem,
  );
  await dependencies.fileSystem.makeDirectory(
    dependencies.paths.bundleDir,
  );
  await dependencies.fileSystem.copyFile(
    dependencies.builtAgentEntry,
    dependencies.paths.agentEntry,
  );

  try {
    await dependencies.launchAgent.install(
      dependencies.paths,
      dependencies.nodePath,
      dependencies.runner,
    );
    dependencies.output(
      `Paired successfully as device ${result.deviceId}. The background connector is loaded.`,
    );
  } catch (error) {
    const detail =
      error instanceof Error ? ` (${error.message})` : "";
    dependencies.output(
      `Paired successfully as device ${result.deviceId}, but the LaunchAgent could not be installed${detail}.`,
    );
    dependencies.output(
      "Run `pnpm --filter @meld/connector cli start` to start the connector in the foreground.",
    );
  }
}

async function status(dependencies: CliDependencies): Promise<void> {
  const config = await readConfig(
    dependencies.paths,
    dependencies.fileSystem,
  );
  const loaded = await dependencies.launchAgent.isLoaded(
    dependencies.paths,
    dependencies.runner,
  );

  dependencies.output(`Device ID: ${config.deviceId}`);
  dependencies.output(`Provider: ${config.requestedProvider}`);
  dependencies.output(`Gateway URL: ${config.gatewayUrl}`);
  dependencies.output(`Loaded: ${loaded ? "yes" : "no"}`);
}

async function uninstall(
  dependencies: CliDependencies,
): Promise<void> {
  let deviceId: string | undefined;
  if (
    await dependencies.fileSystem.exists(
      dependencies.paths.configFile,
    )
  ) {
    const config = await readConfig(
      dependencies.paths,
      dependencies.fileSystem,
    );
    deviceId = config.deviceId;
  }

  await dependencies.launchAgent.uninstall(
    dependencies.paths,
    dependencies.runner,
  );
  await dependencies.createCredentialStore(deviceId).delete();
  await dependencies.fileSystem.removeTree(dependencies.paths.root);

  if (deviceId) {
    dependencies.output(
      `Connector uninstalled locally. Revoke device ${deviceId} in the Meld web UI to remove its server-side record.`,
    );
    return;
  }

  dependencies.output(
    "Connector uninstalled locally. If this device appears in Meld, revoke it in the web UI.",
  );
}

export async function runCli(
  argv: string[],
  dependencies: CliDependencies = runtimeDependencies(),
): Promise<void> {
  switch (argv[0]) {
    case "pair":
      await pair(argv, dependencies);
      return;

    case "start":
      if (argv.length !== 1) {
        throw new Error("Usage: cli start");
      }
      dependencies.output("Starting the Meld connector in the foreground.");
      await dependencies.startForeground();
      return;

    case "status":
      if (argv.length !== 1) {
        throw new Error("Usage: cli status");
      }
      await status(dependencies);
      return;

    case "uninstall":
      if (argv.length !== 1) {
        throw new Error("Usage: cli uninstall");
      }
      await uninstall(dependencies);
      return;

    default:
      throw new Error(
        "Usage: cli <pair --join CODE | start | status | uninstall>",
      );
  }
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown connector error.";
}

async function main(): Promise<void> {
  try {
    await runCli(process.argv.slice(2));
  } catch (error) {
    console.error(`Meld connector CLI failed: ${errorMessage(error)}`);
    process.exitCode = 1;
  }
}

const invokedPath = process.argv[1];
if (
  invokedPath !== undefined &&
  import.meta.url === pathToFileURL(invokedPath).href
) {
  void main();
}
