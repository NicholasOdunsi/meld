import path from "node:path";
import type { Provider } from "@meld/contracts";

const SAFE_VERSION = /^[0-9A-Za-z][0-9A-Za-z.+-]*$/;

export interface ConnectorPaths {
  root: string;
  bundleDir: string;
  agentEntry: string;
  configFile: string;
  logFile: string;
  plistFile: string;
  launchLabel: string;
  runtimeRoot: string;
  runtimeCurrent: string;
  runtimeNode: string;
  runtimeNpm: string;
  runtimeVersion(version: string): string;
  runtimeStaging(version: string): string;
  runtimeDiscarded(version: string): string;
  downloadsDir: string;
  providersRoot: string;
  providerCurrent(provider: Provider): string;
  providerVersion(provider: Provider, version: string): string;
  providerHome(provider: Provider): string;
  tasksRoot: string;
  stateDir: string;
  providerLoginCommand: string;
  /** Directory holding the `security` shim; prepended to the managed Claude PATH. */
  securityShimDir: string;
  /** The `security` shim itself: a no-op that fails fast so Claude uses file storage. */
  securityShim: string;
}

function assertSafeVersion(version: string): string {
  if (!SAFE_VERSION.test(version)) {
    throw new Error(
      "Refusing to build a managed path from an unsafe version string.",
    );
  }
  return version;
}

export function connectorPaths(home: string): ConnectorPaths {
  const root = path.join(home, "Library", "Application Support", "Meld");
  const bundleDir = path.join(root, "connector", "current");
  const launchLabel = "com.meld.agent";
  const runtimeRoot = path.join(root, "runtime");
  const runtimeCurrent = path.join(runtimeRoot, "current");
  const providersRoot = path.join(root, "providers");
  const stateDir = path.join(root, "state");

  return {
    root,
    bundleDir,
    agentEntry: path.join(bundleDir, "agent.mjs"),
    configFile: path.join(root, "config.json"),
    logFile: path.join(root, "logs", "agent.log"),
    plistFile: path.join(
      home,
      "Library",
      "LaunchAgents",
      `${launchLabel}.plist`,
    ),
    launchLabel,
    runtimeRoot,
    runtimeCurrent,
    runtimeNode: path.join(runtimeCurrent, "bin", "node"),
    runtimeNpm: path.join(runtimeCurrent, "bin", "npm"),
    runtimeVersion: (version) =>
      path.join(runtimeRoot, "versions", assertSafeVersion(version)),
    runtimeStaging: (version) =>
      path.join(runtimeRoot, "staging", assertSafeVersion(version)),
    runtimeDiscarded: (version) =>
      path.join(runtimeRoot, "discarded", assertSafeVersion(version)),
    downloadsDir: path.join(root, "downloads"),
    providersRoot,
    providerCurrent: (provider) =>
      path.join(providersRoot, provider, "current"),
    providerVersion: (provider, version) =>
      path.join(
        providersRoot,
        provider,
        "versions",
        assertSafeVersion(version),
      ),
    providerHome: (provider) => path.join(providersRoot, provider, "home"),
    tasksRoot: path.join(root, "tasks"),
    stateDir,
    providerLoginCommand: path.join(stateDir, "provider-login.command"),
    securityShimDir: path.join(root, "security-shim"),
    securityShim: path.join(root, "security-shim", "security"),
  };
}
