import { mkdtemp, readFile, readdir, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { connectorPaths } from "../config/paths";
import type { CommandResult } from "./command-runner";
import {
  installLaunchAgent,
  isLaunchAgentLoaded,
  launchAgentRunState,
  renderLaunchAgent,
  uninstallLaunchAgent,
  updateLaunchAgentNodePath,
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

  it("treats the modern launchctl not-found shape as not loaded", async () => {
    // On macOS 15+/26 `launchctl print` for an unregistered label exits 113
    // with "Could not find service ... in domain for user gui: 501", not the
    // older code-3 "No such process". Both mean the same thing.
    const runner = {
      run: vi.fn().mockResolvedValue({
        stdout: "",
        stderr:
          'Bad request.\nCould not find service "com.meld.agent" in domain for user gui: 501',
        code: 113,
      }),
    };

    await expect(isLaunchAgentLoaded(PATHS, runner)).resolves.toBe(false);
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

  it("reports a running agent with its pid", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        stdout: "\tstate = running\n\tpid = 4210\n\tlast exit code = (never exited)\n",
        code: 0,
      }),
    };

    await expect(launchAgentRunState(PATHS, runner)).resolves.toEqual({
      status: "running",
      pid: 4210,
    });
  });

  it("reports a loaded-but-exited agent with its last exit code", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        stdout: "\tstate = not running\n\tlast exit code = 1\n",
        code: 0,
      }),
    };

    await expect(launchAgentRunState(PATHS, runner)).resolves.toEqual({
      status: "stopped",
      lastExitCode: 1,
    });
  });

  it("reports a not-loaded agent", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        stdout: "",
        stderr: "No such process",
        code: 3,
      }),
    };

    await expect(launchAgentRunState(PATHS, runner)).resolves.toEqual({
      status: "not-loaded",
    });
  });

  it("reports a not-loaded agent from the modern launchctl not-found shape", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({
        stdout: "",
        stderr:
          'Bad request.\nCould not find service "com.meld.agent" in domain for user gui: 501',
        code: 113,
      }),
    };

    await expect(launchAgentRunState(PATHS, runner)).resolves.toEqual({
      status: "not-loaded",
    });
  });

  it("fails run-state checks on unexpected launchctl errors", async () => {
    const runner = {
      run: vi.fn().mockResolvedValue({ stdout: "Permission denied", code: 1 }),
    };

    await expect(launchAgentRunState(PATHS, runner)).rejects.toThrow(
      "Permission denied",
    );
  });
});

describe("LaunchAgent private runtime cutover", () => {
  const NODE_VERSION = "24.8.0";

  interface CutoverRunnerOptions {
    nodeVersion?: string;
    nodeCode?: number;
    /** `nodeCommandRunner` rejects, not resolves, when the spawn itself fails. */
    nodeError?: Error;
    bootstrap?: CommandResult | CommandResult[];
    loaded?: boolean;
  }

  function cutoverRunner(options: CutoverRunnerOptions = {}) {
    const calls: { executable: string; args: readonly string[] }[] = [];
    const bootstrapResults = Array.isArray(options.bootstrap)
      ? [...options.bootstrap]
      : options.bootstrap
        ? [options.bootstrap]
        : [];

    const run = vi.fn(
      async (
        executable: string,
        args: readonly string[],
      ): Promise<CommandResult> => {
        calls.push({ executable, args });
        if (args[0] === "--version") {
          if (options.nodeError) {
            throw options.nodeError;
          }
          return {
            stdout: `v${options.nodeVersion ?? NODE_VERSION}\n`,
            code: options.nodeCode ?? 0,
          };
        }
        if (args[0] === "print") {
          return options.loaded === false
            ? { stdout: "", stderr: "No such process", code: 3 }
            : { stdout: "", code: 0 };
        }
        if (args[0] === "bootstrap") {
          return bootstrapResults.shift() ?? { stdout: "", code: 0 };
        }
        return { stdout: "", code: 0 };
      },
    );

    return { run, calls };
  }

  function actions(
    calls: { executable: string; args: readonly string[] }[],
  ): string[] {
    return calls.map(({ args }) => args[0] ?? "");
  }

  it("updates a loaded agent for its next launch without unloading it", async () => {
    const paths = await temporaryPaths();
    const privateNode = `${paths.runtimeCurrent}/bin/node`;
    await installLaunchAgent(paths, NODE_PATH, cutoverRunner());
    const runner = cutoverRunner({ loaded: true });

    await expect(
      updateLaunchAgentNodePath(paths, privateNode, NODE_VERSION, runner),
    ).resolves.toBeUndefined();

    expect(runner.calls[0]).toEqual({
      executable: privateNode,
      args: ["--version"],
    });
    expect(actions(runner.calls)).toEqual(["--version", "print"]);
    await expect(readFile(paths.plistFile, "utf8")).resolves.toBe(
      renderLaunchAgent(paths, privateNode),
    );
  });

  it("leaves no temporary plist behind", async () => {
    const paths = await temporaryPaths();
    const privateNode = `${paths.runtimeCurrent}/bin/node`;

    await updateLaunchAgentNodePath(
      paths,
      privateNode,
      NODE_VERSION,
      cutoverRunner(),
    );

    const entries = await readdir(path.dirname(paths.plistFile));
    expect(entries).toEqual([path.basename(paths.plistFile)]);
  });

  it("refuses to write a plist when the private node reports another version", async () => {
    const paths = await temporaryPaths();
    const privateNode = `${paths.runtimeCurrent}/bin/node`;
    const runner = cutoverRunner({ nodeVersion: "22.11.0" });

    await expect(
      updateLaunchAgentNodePath(paths, privateNode, NODE_VERSION, runner),
    ).rejects.toThrow(/v24\.8\.0/);

    expect(actions(runner.calls)).toEqual(["--version"]);
    await expect(readFile(paths.plistFile, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("refuses to write a plist when the private node cannot run", async () => {
    const paths = await temporaryPaths();
    const runner = cutoverRunner({ nodeCode: 126, nodeVersion: "" });

    await expect(
      updateLaunchAgentNodePath(
        paths,
        `${paths.runtimeCurrent}/bin/node`,
        NODE_VERSION,
        runner,
      ),
    ).rejects.toThrow(/private Node runtime/i);
    expect(actions(runner.calls)).toEqual(["--version"]);
  });

  it("refuses to write a plist when the private node cannot be spawned", async () => {
    const paths = await temporaryPaths();
    const privateNode = `${paths.runtimeCurrent}/bin/node`;

    for (const code of ["ENOENT", "EACCES"]) {
      const runner = cutoverRunner({
        nodeError: Object.assign(
          new Error(`spawn ${privateNode} ${code}`),
          { code, syscall: "spawn", path: privateNode },
        ),
      });

      await expect(
        updateLaunchAgentNodePath(paths, privateNode, NODE_VERSION, runner),
      ).rejects.toThrow(/private Node runtime could not be run/i);

      expect(actions(runner.calls)).toEqual(["--version"]);
      await expect(readFile(paths.plistFile, "utf8")).rejects.toMatchObject({
        code: "ENOENT",
      });
    }
  });

  it("does not restart a loaded agent that already targets the verified node", async () => {
    const paths = await temporaryPaths();
    const privateNode = `${paths.runtimeCurrent}/bin/node`;
    await installLaunchAgent(paths, privateNode, cutoverRunner());
    const runner = cutoverRunner({ loaded: true });

    await updateLaunchAgentNodePath(
      paths,
      privateNode,
      NODE_VERSION,
      runner,
    );

    expect(actions(runner.calls)).toEqual(["--version", "print"]);
    await expect(readFile(paths.plistFile, "utf8")).resolves.toBe(
      renderLaunchAgent(paths, privateNode),
    );
  });

  it("bootstraps an unloaded agent after writing the verified node", async () => {
    const paths = await temporaryPaths();
    const privateNode = `${paths.runtimeCurrent}/bin/node`;
    await installLaunchAgent(paths, NODE_PATH, cutoverRunner());
    const runner = cutoverRunner({ loaded: false });

    await updateLaunchAgentNodePath(
      paths,
      privateNode,
      NODE_VERSION,
      runner,
    );

    expect(actions(runner.calls)).toEqual([
      "--version",
      "print",
      "bootstrap",
    ]);
    const userDomain = `gui/${process.getuid?.()}`;
    expect(runner.calls.at(-1)?.args).toEqual([
      "bootstrap",
      userDomain,
      paths.plistFile,
    ]);
    await expect(readFile(paths.plistFile, "utf8")).resolves.toBe(
      renderLaunchAgent(paths, privateNode),
    );
  });

  it("restores the previous plist when bootstrap fails", async () => {
    const paths = await temporaryPaths();
    const previousNode = NODE_PATH;
    const privateNode = `${paths.runtimeCurrent}/bin/node`;
    await installLaunchAgent(paths, previousNode, cutoverRunner());
    const runner = cutoverRunner({
      loaded: false,
      bootstrap: { stdout: "", stderr: "bootstrap failed", code: 5 },
    });

    await expect(
      updateLaunchAgentNodePath(paths, privateNode, NODE_VERSION, runner),
    ).rejects.toThrow(/bootstrap failed/);

    expect(actions(runner.calls)).toEqual([
      "--version",
      "print",
      "bootstrap",
    ]);
    await expect(readFile(paths.plistFile, "utf8")).resolves.toBe(
      renderLaunchAgent(paths, previousNode),
    );
  });

  it("removes the plist it wrote when there was none to restore", async () => {
    const paths = await temporaryPaths();
    const runner = cutoverRunner({
      loaded: false,
      bootstrap: { stdout: "", stderr: "bootstrap failed", code: 5 },
    });

    await expect(
      updateLaunchAgentNodePath(
        paths,
        `${paths.runtimeCurrent}/bin/node`,
        NODE_VERSION,
        runner,
      ),
    ).rejects.toThrow(/bootstrap failed/);

    await expect(readFile(paths.plistFile, "utf8")).rejects.toMatchObject({
      code: "ENOENT",
    });
    expect(actions(runner.calls)).toEqual([
      "--version",
      "print",
      "bootstrap",
    ]);
  });

  it("never references a package manager's node after the cutover", async () => {
    const paths = await temporaryPaths();
    const privateNode = `${paths.runtimeCurrent}/bin/node`;

    await updateLaunchAgentNodePath(
      paths,
      privateNode,
      NODE_VERSION,
      cutoverRunner(),
    );

    const plist = await readFile(paths.plistFile, "utf8");
    expect(plist).toContain(`<string>${privateNode}</string>`);
    expect(plist).not.toContain("/.nvm/");
    expect(plist).not.toContain("/opt/homebrew");
    expect(plist).not.toContain("/usr/local");
  });
});
