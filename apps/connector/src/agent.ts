import { arch as osArch, homedir, platform as osPlatform } from "node:os";
import { pathToFileURL } from "node:url";
import type { Provider, ProviderStatus } from "@meld/contracts";
import {
  nodeConnectorFileSystem,
  nodeManagedFileSystem,
  readConfig,
  type ConnectorFileSystem,
  type ManagedFileSystem,
} from "./config/connector-config";
import { connectorPaths, type ConnectorPaths } from "./config/paths";
import {
  nodeCommandRunner,
  type CommandRunner,
} from "./launchd/command-runner";
import type { CredentialStore } from "./pairing/credential-store";
import { KeychainStore } from "./pairing/keychain-store";
import { ArtifactDownloader } from "./providers/artifact-downloader";
import { createClaudeAdapter } from "./providers/claude-adapter";
import { createCodexAdapter } from "./providers/codex-adapter";
import type { ProviderAdapter } from "./providers/provider-adapter";
import { ProviderDetector } from "./providers/provider-detector";
import { ProviderInstaller } from "./providers/provider-installer";
import {
  nodeProcessRunner,
  type ProcessRunner,
} from "./providers/process-runner";
import {
  launchAgentRuntimeActivator,
  nodeLoginScriptWriter,
  nodeSetupClock,
  ProviderSetup,
} from "./providers/provider-setup";
import { RuntimeInstaller } from "./providers/runtime-installer";
import { removeAbandonedWorkspaces } from "./security/task-workspace";
import { TaskExecutor } from "./tasks/task-executor";
import {
  GatewayClient,
  type ProviderSetupLike,
  type TaskExecutorLike,
} from "./transport/gateway-client";

interface StartableGateway {
  start(): Promise<void>;
}

interface GatewayOptions {
  gatewayUrl: string;
  credentialStore: CredentialStore;
  requestedProvider: Provider;
  createProviderSetup(): ProviderSetupLike;
  createTaskExecutor(): TaskExecutorLike;
  detectProviders(): Promise<ProviderStatus[]>;
  onTerminal(reason: string): void;
}

export interface AgentDependencies {
  paths: ConnectorPaths;
  runner: CommandRunner;
  fileSystem: ConnectorFileSystem;
  managedFileSystem?: ManagedFileSystem;
  processRunner?: ProcessRunner;
  platform?: string;
  arch?: string;
  fetch?: typeof globalThis.fetch;
  createCredentialStore?(
    runner: CommandRunner,
    deviceId: string,
  ): CredentialStore;
  createGatewayClient?(options: GatewayOptions): StartableGateway;
  sweepAbandonedWorkspaces?(paths: ConnectorPaths): Promise<unknown>;
  diagnostic?(line: string): void;
}

function runtimeDependencies(): AgentDependencies {
  return {
    paths: connectorPaths(homedir()),
    runner: nodeCommandRunner,
    fileSystem: nodeConnectorFileSystem,
  };
}

/**
 * The shared provider graph the gateway client drives: one runtime installer,
 * provider installer, detector, setup, adapter registry, and task executor,
 * built from a single set of paths and process runner so every provider process
 * flows through the same choke point.
 */
function buildProviderGraph(dependencies: AgentDependencies): {
  createProviderSetup(): ProviderSetupLike;
  createTaskExecutor(): TaskExecutorLike;
  detectProviders(): Promise<ProviderStatus[]>;
} {
  const paths = dependencies.paths;
  const runner = dependencies.runner;
  const managedFileSystem =
    dependencies.managedFileSystem ?? nodeManagedFileSystem;
  const processRunner = dependencies.processRunner ?? nodeProcessRunner;
  const platform = dependencies.platform ?? osPlatform();
  const arch = dependencies.arch ?? osArch();
  const fetch = dependencies.fetch ?? globalThis.fetch;

  const runtimeInstaller = new RuntimeInstaller({
    paths,
    fileSystem: managedFileSystem,
    runner,
    downloader: new ArtifactDownloader({ fetch, fileSystem: managedFileSystem }),
    activator: launchAgentRuntimeActivator(paths, runner),
    platform,
    arch,
  });
  const providerInstaller = new ProviderInstaller({
    paths,
    fileSystem: managedFileSystem,
    runner,
    processRunner,
    platform,
  });
  const detector = new ProviderDetector({
    paths,
    fileSystem: managedFileSystem,
    processRunner,
  });
  const setup = new ProviderSetup({
    paths,
    fileSystem: managedFileSystem,
    runner,
    runtimeInstaller,
    providerInstaller,
    detector,
    scriptWriter: nodeLoginScriptWriter,
    clock: nodeSetupClock,
    platform,
  });
  const adapters: Partial<Record<Provider, ProviderAdapter>> = {
    codex: createCodexAdapter({ paths, processRunner }),
    claude: createClaudeAdapter({ paths, processRunner }),
  };
  const executor = new TaskExecutor({ paths, adapters });

  return {
    createProviderSetup: () => setup,
    createTaskExecutor: () => executor,
    detectProviders: () => detector.detectAll(),
  };
}

export async function startAgent(
  dependencies: AgentDependencies = runtimeDependencies(),
): Promise<StartableGateway> {
  const config = await readConfig(
    dependencies.paths,
    dependencies.fileSystem,
  );
  const credentialStore = dependencies.createCredentialStore
    ? dependencies.createCredentialStore(
        dependencies.runner,
        config.deviceId,
      )
    : new KeychainStore(dependencies.runner, config.deviceId);
  const diagnostic = dependencies.diagnostic ?? console.error;
  const graph = buildProviderGraph(dependencies);

  // Sweep workspaces a previous run left behind before opening the gateway, so
  // a stale task directory is never mistaken for a live one.
  const sweep =
    dependencies.sweepAbandonedWorkspaces ??
    ((paths: ConnectorPaths) => removeAbandonedWorkspaces(paths));
  await sweep(dependencies.paths);

  const gatewayOptions: GatewayOptions = {
    gatewayUrl: config.gatewayUrl,
    credentialStore,
    requestedProvider: config.requestedProvider,
    createProviderSetup: graph.createProviderSetup,
    createTaskExecutor: graph.createTaskExecutor,
    detectProviders: graph.detectProviders,
    onTerminal(reason) {
      diagnostic(`Meld connector stopped: ${reason}.`);
    },
  };
  const gateway = dependencies.createGatewayClient
    ? dependencies.createGatewayClient(gatewayOptions)
    : new GatewayClient(gatewayOptions);

  await gateway.start();
  return gateway;
}

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown connector error.";
}

async function main(): Promise<void> {
  try {
    await startAgent();
  } catch (error) {
    console.error(`Meld connector failed: ${errorMessage(error)}`);
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
