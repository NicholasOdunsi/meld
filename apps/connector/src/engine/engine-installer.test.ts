import path from "node:path";
import { describe, expect, it, vi } from "vitest";
import type { ManagedFileSystem } from "../config/connector-config";
import { connectorPaths } from "../config/paths";
import type { CommandOptions } from "../launchd/command-runner";
import { RELEASES } from "../providers/release-manifest";
import { EngineInstaller } from "./engine-installer";

const paths = connectorPaths("/Users/test");
const versionDir = paths.engineVersion(RELEASES.engine.version);

function lockFor(version: string, integrity: string) {
  return JSON.stringify({ packages: { "node_modules/t3": { version, integrity, resolved: `https://registry.npmjs.org/t3/-/t3-${version}.tgz` } } });
}

function fakes(options: { lock?: string; versionOutput?: string; npmCode?: number; healthy?: boolean } = {}) {
  const files = new Map<string, string>();
  if (options.healthy) files.set(path.join(versionDir, "package-lock.json"), lockFor(RELEASES.engine.version, RELEASES.engine.integrity));
  const fileSystem = {
    exists: vi.fn(async (file: string) => files.has(file) || file === versionDir && options.healthy === true),
    readText: vi.fn(async (file: string) => {
      if (!files.has(file)) throw Object.assign(new Error("missing"), { code: "ENOENT" });
      return files.get(file)!;
    }),
    makeDirectory: vi.fn(async () => {}),
    removeTree: vi.fn(async () => {}),
    rename: vi.fn(async () => {}),
    createSymlink: vi.fn(async () => {}),
    readSymlink: vi.fn(async () => undefined),
    copyFile: vi.fn(async () => {}),
    writePrivateText: vi.fn(async () => {}),
    openPrivateFile: vi.fn(),
  } satisfies ManagedFileSystem;
  const runner = {
    run: vi.fn(async (command: string, args: string[], _options?: CommandOptions) => {
      if (command === paths.runtimeNpm) {
        files.set(path.join(args[2]!, "package-lock.json"), options.lock ?? lockFor(RELEASES.engine.version, RELEASES.engine.integrity));
        return { stdout: "", stderr: "npm ERR! 429", code: options.npmCode ?? 0 };
      }
      if (args[1] === "--version") return { stdout: `t3 v${options.versionOutput ?? RELEASES.engine.version}\n`, code: 0 };
      return { stdout: "", code: 1 };
    }),
  };
  return { fileSystem, runner };
}

describe("EngineInstaller", () => {
  it("installs the pinned engine into Orion's private folder", async () => {
    const { fileSystem, runner } = fakes();
    const installer = new EngineInstaller({ paths, fileSystem, runner });
    const result = await installer.install();
    expect(result).toEqual({ version: RELEASES.engine.version, executable: paths.engineExecutable, alreadyInstalled: false });
    const npmCall = runner.run.mock.calls.find(([command]) => command === paths.runtimeNpm)!;
    expect(npmCall[1]).toEqual(["install", "--prefix", expect.stringContaining(`${versionDir}.staging-`), "--save-exact", "--ignore-scripts", `t3@${RELEASES.engine.version}`]);
    expect(npmCall[2]?.env?.HOME).toBe(paths.engineHome);
    expect(npmCall[2]?.env?.npm_config_registry).toBe("https://registry.npmjs.org/");
    expect(runner.run).toHaveBeenCalledWith(
      paths.runtimeNode,
      [expect.stringMatching(/node_modules\/t3\/bin\/t3\.mjs$/), "--version"],
      { env: expect.objectContaining({ T3CODE_HOME: paths.engineHome, T3CODE_TELEMETRY_ENABLED: "false" }) },
    );
    expect(fileSystem.rename).toHaveBeenCalledWith(expect.stringContaining(".staging-"), versionDir);
  });

  it("skips the download when the pinned engine is already healthy", async () => {
    const { fileSystem, runner } = fakes({ healthy: true });
    const result = await new EngineInstaller({ paths, fileSystem, runner }).install();
    expect(result.alreadyInstalled).toBe(true);
    expect(runner.run.mock.calls.some(([command]) => command === paths.runtimeNpm)).toBe(false);
  });

  it("refuses bytes that do not match the pinned integrity", async () => {
    const { fileSystem, runner } = fakes({ lock: lockFor(RELEASES.engine.version, `sha512-${"A".repeat(86)}==`) });
    await expect(new EngineInstaller({ paths, fileSystem, runner }).install())
      .rejects.toMatchObject({ reason: "integrity-mismatch" });
    expect(fileSystem.rename).not.toHaveBeenCalled();
    expect(runner.run).toHaveBeenCalledTimes(1);
  });

  it("refuses a binary reporting another version", async () => {
    const { fileSystem, runner } = fakes({ versionOutput: `${RELEASES.engine.version}0` });
    await expect(new EngineInstaller({ paths, fileSystem, runner }).install())
      .rejects.toMatchObject({ reason: "version-mismatch" });
  });

  it("reports a redacted npm failure", async () => {
    const { fileSystem, runner } = fakes({ npmCode: 1 });
    await expect(new EngineInstaller({ paths, fileSystem, runner }).install())
      .rejects.toMatchObject({ reason: "install-failed", message: expect.stringContaining("exit code 1") });
  });
});
