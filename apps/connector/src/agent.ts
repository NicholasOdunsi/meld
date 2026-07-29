import { homedir } from "node:os";
import { pathToFileURL } from "node:url";
import {
  nodeConnectorFileSystem,
  readConfig,
  type ConnectorFileSystem,
} from "./config/connector-config";
import { connectorPaths, type ConnectorPaths } from "./config/paths";
import {
  nodeCommandRunner,
  type CommandRunner,
} from "./launchd/command-runner";
import type { CredentialStore } from "./pairing/credential-store";
import { KeychainStore } from "./pairing/keychain-store";
import { GatewayClient } from "./transport/gateway-client";
import type { Provider } from "@meld/contracts";

interface StartableGateway {
  start(): Promise<void>;
}

interface GatewayOptions {
  gatewayUrl: string;
  credentialStore: CredentialStore;
  requestedProvider: Provider;
  onTerminal(reason: string): void;
}

export interface AgentDependencies {
  paths: ConnectorPaths;
  runner: CommandRunner;
  fileSystem: ConnectorFileSystem;
  createCredentialStore?(
    runner: CommandRunner,
    deviceId: string,
  ): CredentialStore;
  createGatewayClient?(options: GatewayOptions): StartableGateway;
  diagnostic?(line: string): void;
}

function runtimeDependencies(): AgentDependencies {
  return {
    paths: connectorPaths(homedir()),
    runner: nodeCommandRunner,
    fileSystem: nodeConnectorFileSystem,
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
  const gatewayOptions: GatewayOptions = {
    gatewayUrl: config.gatewayUrl,
    credentialStore,
    requestedProvider: config.requestedProvider,
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
