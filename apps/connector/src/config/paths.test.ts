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

  it("exposes the managed private runtime paths", () => {
    const paths = connectorPaths("/Users/ada");
    const root = "/Users/ada/Library/Application Support/Meld";

    expect(paths.runtimeRoot).toBe(`${root}/runtime`);
    expect(paths.runtimeCurrent).toBe(
      "/Users/ada/Library/Application Support/Meld/runtime/current",
    );
    expect(paths.runtimeNode).toBe(`${root}/runtime/current/bin/node`);
    expect(paths.runtimeNpm).toBe(`${root}/runtime/current/bin/npm`);
    expect(paths.runtimeVersion("24.8.0")).toBe(
      `${root}/runtime/versions/24.8.0`,
    );
    expect(paths.runtimeStaging("24.8.0")).toBe(
      `${root}/runtime/staging/24.8.0`,
    );
    expect(paths.runtimeDiscarded("24.8.0")).toBe(
      `${root}/runtime/discarded/24.8.0`,
    );
    expect(paths.downloadsDir).toBe(`${root}/downloads`);
  });

  it("exposes per-provider managed paths", () => {
    const paths = connectorPaths("/Users/ada");
    const root = "/Users/ada/Library/Application Support/Meld";

    expect(paths.providerCurrent("codex")).toContain(
      "/providers/codex/current",
    );
    expect(paths.providerCurrent("codex")).toBe(
      `${root}/providers/codex/current`,
    );
    expect(paths.providerVersion("codex", "0.146.0")).toBe(
      `${root}/providers/codex/versions/0.146.0`,
    );
    expect(paths.providerHome("claude")).toContain(
      "/providers/claude/home",
    );
    expect(paths.providerHome("claude")).toBe(
      `${root}/providers/claude/home`,
    );
  });

  it("exposes the managed task and state paths", () => {
    const paths = connectorPaths("/Users/ada");

    expect(paths.tasksRoot).toContain("/Meld/tasks");
    expect(paths.providerLoginCommand).toContain(
      "/Meld/state/provider-login.command",
    );
    expect(paths.stateDir).toBe(
      "/Users/ada/Library/Application Support/Meld/state",
    );
  });

  it("keeps every managed path under the Meld root", () => {
    const paths = connectorPaths("/Users/ada");

    for (const managed of [
      paths.runtimeRoot,
      paths.runtimeCurrent,
      paths.runtimeNode,
      paths.runtimeNpm,
      paths.runtimeVersion("24.8.0"),
      paths.runtimeStaging("24.8.0"),
      paths.runtimeDiscarded("24.8.0"),
      paths.downloadsDir,
      paths.providerCurrent("codex"),
      paths.providerVersion("claude", "2.1.220"),
      paths.providerHome("claude"),
      paths.tasksRoot,
      paths.stateDir,
      paths.providerLoginCommand,
    ]) {
      expect(managed.startsWith(`${paths.root}/`)).toBe(true);
    }
  });

  it("refuses a version string that could escape the managed root", () => {
    const paths = connectorPaths("/Users/ada");

    expect(() => paths.runtimeVersion("../../../etc")).toThrow(
      /version/i,
    );
    expect(() => paths.runtimeStaging("24.8.0/../..")).toThrow(
      /version/i,
    );
    expect(() => paths.runtimeDiscarded("")).toThrow(/version/i);
    expect(() =>
      paths.providerVersion("codex", "0.146.0/../../../.."),
    ).toThrow(/version/i);
  });
});
