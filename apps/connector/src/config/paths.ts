import path from "node:path";

export interface ConnectorPaths {
  root: string;
  bundleDir: string;
  agentEntry: string;
  configFile: string;
  logFile: string;
  plistFile: string;
  launchLabel: string;
}

export function connectorPaths(home: string): ConnectorPaths {
  const root = path.join(home, "Library", "Application Support", "Meld");
  const bundleDir = path.join(root, "connector", "current");
  const launchLabel = "com.meld.agent";

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
  };
}
