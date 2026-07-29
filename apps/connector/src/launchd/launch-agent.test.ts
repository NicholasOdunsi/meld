import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectorPaths } from "../config/paths";
import {
  installLaunchAgent,
  isLaunchAgentLoaded,
  renderLaunchAgent,
  uninstallLaunchAgent,
} from "./launch-agent";

const PATHS = connectorPaths("/Users/ada");
const NODE_PATH = "/Users/ada/.nvm/versions/node/v20.19.0/bin/node";
const temporaryHomes: string[] = [];

async function temporaryPaths() {
  const home = await mkdtemp(path.join(os.tmpdir(), "meld-connector-"));
  temporaryHomes.push(home);
  return connectorPaths(home);
}

afterEach(async () => {
  await Promise.all(
    temporaryHomes
      .splice(0)
      .map((home) => rm(home, { recursive: true, force: true })),
  );
});

describe("LaunchAgent", () => {
  it("runs at load and restarts crashes but not clean terminal exits", () => {
    const plist = renderLaunchAgent(PATHS, NODE_PATH);

    expect(plist).toContain("<string>com.meld.agent</string>");
    expect(plist).toContain(`<string>${NODE_PATH}</string>`);
    expect(plist).toContain(`<string>${PATHS.agentEntry}</string>`);
    expect(plist).toContain("<key>RunAtLoad</key>");
    expect(plist).toContain("<key>KeepAlive</key>");
    expect(plist).toMatch(
      /<key>KeepAlive<\/key>\s*<dict>\s*<key>SuccessfulExit<\/key>\s*<false\/>\s*<\/dict>/,
    );
    expect(plist).not.toMatch(
      /<key>KeepAlive<\/key>\s*<true\/>/,
    );
    expect(plist).toContain(PATHS.logFile);
  });

  it("escapes dynamic values in XML", () => {
    const paths = {
      ...PATHS,
      agentEntry: `${PATHS.bundleDir}/agent<&>.mjs`,
      launchLabel: "com.meld.agent<&>",
      logFile: `${PATHS.root}/logs/agent<&>.log`,
    };

    const plist = renderLaunchAgent(paths, "/path/to/node<&>");

    expect(plist).toContain("<string>com.meld.agent&lt;&amp;&gt;</string>");
    expect(plist).toContain("<string>/path/to/node&lt;&amp;&gt;</string>");
    expect(plist).toContain("agent&lt;&amp;&gt;.mjs</string>");
    expect(plist).toContain("agent&lt;&amp;&gt;.log</string>");
  });

  it("never references a package manager's directories", () => {
    const plist = renderLaunchAgent(PATHS, NODE_PATH);

    expect(plist).not.toContain("/usr/local");
    expect(plist).not.toContain("/opt/homebrew");
  });

  it("replaces any previously loaded agent before loading", async () => {
    const paths = await temporaryPaths();
    const runner = { run: vi.fn().mockResolvedValue({ stdout: "", code: 0 }) };

    await installLaunchAgent(paths, NODE_PATH, runner);

    const commands = runner.run.mock.calls.map(([, args]) => args[0]);
    expect(commands).toEqual(["bootout", "bootstrap"]);
    await expect(readFile(paths.plistFile, "utf8")).resolves.toBe(
      renderLaunchAgent(paths, NODE_PATH),
    );
  });

  it("treats bootout of a not-loaded agent as success", async () => {
    const paths = await temporaryPaths();
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({
          stdout: "",
          stderr: "No such process",
          code: 3,
        })
        .mockResolvedValueOnce({ stdout: "", code: 0 }),
    };

    await expect(
      installLaunchAgent(paths, NODE_PATH, runner),
    ).resolves.toBeUndefined();
  });

  it("does not classify code 3 with another diagnostic as not loaded", async () => {
    const paths = await temporaryPaths();
    const runner = {
      run: vi.fn().mockResolvedValue({
        stdout: "",
        stderr: "Operation not permitted",
        code: 3,
      }),
    };

    await expect(
      installLaunchAgent(paths, NODE_PATH, runner),
    ).rejects.toThrow("Operation not permitted");
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  it("fails when bootout fails for an unexpected reason during install", async () => {
    const paths = await temporaryPaths();
    const runner = {
      run: vi
        .fn()
        .mockResolvedValue({ stdout: "Permission denied", code: 1 }),
    };

    await expect(
      installLaunchAgent(paths, NODE_PATH, runner),
    ).rejects.toThrow("Permission denied");
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  it("fails when launchctl cannot bootstrap the agent", async () => {
    const paths = await temporaryPaths();
    const runner = {
      run: vi
        .fn()
        .mockResolvedValueOnce({ stdout: "", code: 0 })
        .mockResolvedValueOnce({ stdout: "bootstrap failed", code: 5 }),
    };

    await expect(
      installLaunchAgent(paths, NODE_PATH, runner),
    ).rejects.toThrow("bootstrap failed");
  });

  it("boots out the loaded agent when uninstalling", async () => {
    const paths = await temporaryPaths();
    const runner = { run: vi.fn().mockResolvedValue({ stdout: "", code: 0 }) };

    await installLaunchAgent(paths, NODE_PATH, runner);
    runner.run.mockClear();
    await uninstallLaunchAgent(paths, runner);

    expect(runner.run).toHaveBeenCalledWith("launchctl", [
      "bootout",
      expect.stringMatching(/^gui\/\d+\/com\.meld\.agent$/),
    ]);
    await expect(readFile(paths.plistFile, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("retains the plist when bootout fails unexpectedly during uninstall", async () => {
    const paths = await temporaryPaths();
    const runner = { run: vi.fn().mockResolvedValue({ stdout: "", code: 0 }) };

    await installLaunchAgent(paths, NODE_PATH, runner);
    runner.run.mockResolvedValue({ stdout: "Permission denied", code: 1 });

    await expect(uninstallLaunchAgent(paths, runner)).rejects.toThrow(
      "Permission denied",
    );
    await expect(readFile(paths.plistFile, "utf8")).resolves.toBe(
      renderLaunchAgent(paths, NODE_PATH),
    );
  });

  it("reports whether the agent is loaded", async () => {
    const loadedRunner = {
      run: vi.fn().mockResolvedValue({ stdout: "", code: 0 }),
    };
    const unloadedRunner = {
      run: vi
        .fn()
        .mockResolvedValue({
          stdout: "",
          stderr: "No such process",
          code: 3,
        }),
    };

    await expect(isLaunchAgentLoaded(PATHS, loadedRunner)).resolves.toBe(true);
    await expect(isLaunchAgentLoaded(PATHS, unloadedRunner)).resolves.toBe(
      false,
    );

    expect(loadedRunner.run).toHaveBeenCalledWith("launchctl", [
      "print",
      expect.stringMatching(/^gui\/\d+\/com\.meld\.agent$/),
    ]);
  });

  it("fails status checks on unexpected launchctl errors", async () => {
    const runner = {
      run: vi
        .fn()
        .mockResolvedValue({ stdout: "Permission denied", code: 1 }),
    };

    await expect(isLaunchAgentLoaded(PATHS, runner)).rejects.toThrow(
      "Permission denied",
    );
  });
});
