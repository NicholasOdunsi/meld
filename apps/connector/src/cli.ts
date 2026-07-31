import { homedir } from "node:os";
import { fileURLToPath, pathToFileURL } from "node:url";
import type { ProviderStatus } from "@meld/contracts";
import {
  ConnectorConfigError,
  nodeConnectorFileSystem,
  nodeManagedFileSystem,
  readConfig,
  writeConfig,
  type ConnectorFileSystem,
} from "./config/connector-config";
import { connectorPaths, type ConnectorPaths } from "./config/paths";
import { startAgent } from "./agent";
import { nodeProcessRunner } from "./providers/process-runner";
import { ProviderDetector } from "./providers/provider-detector";
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
const STATUS_LOG_LINES = 20;

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
  detectProviders(): Promise<ProviderStatus[]>;
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
    detectProviders: () =>
      new ProviderDetector({
        paths,
        fileSystem: nodeManagedFileSystem,
        processRunner: nodeProcessRunner,
      }).detectAll(),
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

  const providers = await dependencies.detectProviders();
  dependencies.output("Providers:");
  for (const provider of providers) {
    const version = provider.version ?? "unknown";
    dependencies.output(
      `  ${provider.provider}: ${provider.installation} (${version}), ${provider.authentication}, ${provider.compatibility}`,
    );
  }
  if (
    await dependencies.fileSystem.exists(
      dependencies.paths.logFile,
    )
  ) {
    const log = await dependencies.fileSystem.readText(
      dependencies.paths.logFile,
    );
    const tail = log.split(/\r?\n/).slice(-STATUS_LOG_LINES);
    dependencies.output("Recent agent log:");
    for (const line of tail) {
      dependencies.output(line);
    }
  }
}

async function uninstall(
  dependencies: CliDependencies,
): Promise<void> {
  let deviceId: string | undefined;
  const failures: Error[] = [];

  try {
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
  } catch (error) {
    if (!(error instanceof ConnectorConfigError)) {
      failures.push(cleanupFailure("configuration inspection", error));
    }
  }

  try {
      await dependencies.launchAgent.uninstall(
        dependencies.paths,
        dependencies.runner,
      );
  } catch (error) {
    const failure = cleanupFailure("LaunchAgent stop", error);
    throw new Error(
      `${failure.message}. Local state was preserved; retry uninstall after the agent can be stopped.`,
    );
  }
  await attemptCleanup(
    "credential cleanup",
    failures,
    async () => {
      await dependencies.createCredentialStore(deviceId).delete();
    },
  );
  await attemptCleanup(
    "Application Support cleanup",
    failures,
    async () => {
      await dependencies.fileSystem.removeTree(
        dependencies.paths.root,
      );
    },
  );

  const reminder = deviceId
    ? `Revoke device ${deviceId} in the Meld web UI to remove its server-side record.`
    : "If this device appears in Meld, revoke it in the web UI.";
  if (failures.length > 0) {
    dependencies.output(`Local cleanup was incomplete. ${reminder}`);
    throw new AggregateError(
      failures,
      `Connector uninstall completed with errors: ${failures
        .map((failure) => failure.message)
        .join("; ")}`,
    );
  }

  dependencies.output(`Connector uninstalled locally. ${reminder}`);
}

function cleanupFailure(stage: string, error: unknown): Error {
  const detail =
    error instanceof Error ? error.message : "unknown error";
  return new Error(`${stage} failed: ${detail}`);
}

async function attemptCleanup(
  stage: string,
  failures: Error[],
  operation: () => Promise<void>,
): Promise<void> {
  try {
    await operation();
  } catch (error) {
    failures.push(cleanupFailure(stage, error));
  }
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
