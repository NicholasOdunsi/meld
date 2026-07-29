import { describe, expect, it } from "vitest";
import { connectorPaths } from "./paths";

describe("connector paths", () => {
  it("places everything under Meld's Application Support directory", () => {
    const paths = connectorPaths("/Users/ada");

    expect(paths.root).toBe("/Users/ada/Library/Application Support/Meld");
    expect(paths.bundleDir).toBe(
      "/Users/ada/Library/Application Support/Meld/connector/current",
    );
    expect(paths.agentEntry).toBe(
      "/Users/ada/Library/Application Support/Meld/connector/current/agent.mjs",
    );
    expect(paths.configFile).toBe(
      "/Users/ada/Library/Application Support/Meld/config.json",
    );
    expect(paths.logFile).toBe(
      "/Users/ada/Library/Application Support/Meld/logs/agent.log",
    );
    expect(paths.plistFile).toBe(
      "/Users/ada/Library/LaunchAgents/com.meld.agent.plist",
    );
    expect(paths.launchLabel).toBe("com.meld.agent");
  });
});
