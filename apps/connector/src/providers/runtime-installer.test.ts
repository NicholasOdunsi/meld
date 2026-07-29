import path from "node:path";
import { describe, expect, it } from "vitest";
import { connectorPaths } from "../config/paths";
import type {
  ManagedFileSystem,
  PrivateFileHandle,
} from "../config/connector-config";
import type { CommandResult } from "../launchd/command-runner";
import { RELEASES } from "./release-manifest";
import { RuntimeInstaller } from "./runtime-installer";

const PATHS = connectorPaths("/Users/ada");
const VERSION = RELEASES.node.version;
const VERSION_DIR = PATHS.runtimeVersion(VERSION);
const STAGING_DIR = PATHS.runtimeStaging(VERSION);

interface MemoryFileSystem {
  system: ManagedFileSystem;
  entries: Map<string, "directory" | "file">;
  links: Map<string, string>;
  renames: [string, string][];
  removals: string[];
  putFile(file: string): void;
  hasEntry(target: string): boolean;
}

function memoryFileSystem(): MemoryFileSystem {
  const entries = new Map<string, "directory" | "file">();
  const links = new Map<string, string>();
  const renames: [string, string][] = [];
  const removals: string[] = [];

  function addDirectory(directory: string): void {
    let current = directory;
    while (current !== "/" && current !== path.dirname(current)) {
      if (!entries.has(current)) {
        entries.set(current, "directory");
      }
      current = path.dirname(current);
    }
  }

  function putFile(file: string): void {
    addDirectory(path.dirname(file));
    entries.set(file, "file");
  }

  function owned(target: string): string[] {
    const prefix = `${target}/`;
    return [...entries.keys(), ...links.keys()].filter(
      (key) => key === target || key.startsWith(prefix),
    );
  }

  const system: ManagedFileSystem = {
    exists: async (file) => entries.has(file) || links.has(file),
    readText: async () => {
      throw new Error("unexpected readText");
    },
    writePrivateText: async () => {
      throw new Error("unexpected writePrivateText");
    },
    copyFile: async () => {
      throw new Error("unexpected copyFile");
    },
    makeDirectory: async (directory) => {
      addDirectory(directory);
    },
    removeTree: async (target) => {
      removals.push(target);
      for (const key of owned(target)) {
        entries.delete(key);
        links.delete(key);
      }
    },
    rename: async (source, destination) => {
      renames.push([source, destination]);
      const moved = owned(source);
      if (moved.length === 0) {
        throw Object.assign(new Error(`ENOENT: ${source}`), {
          code: "ENOENT",
        });
      }
      for (const key of owned(destination)) {
        entries.delete(key);
        links.delete(key);
      }
      addDirectory(path.dirname(destination));
      for (const key of moved) {
        const target = key === source
          ? destination
          : path.join(destination, key.slice(source.length + 1));
        const kind = entries.get(key);
        if (kind !== undefined) {
          entries.delete(key);
          entries.set(target, kind);
          continue;
        }
        const linkTarget = links.get(key);
        if (linkTarget !== undefined) {
          links.delete(key);
          links.set(target, linkTarget);
        }
      }
    },
    createSymlink: async (target, linkPath) => {
      if (entries.has(linkPath) || links.has(linkPath)) {
        throw Object.assign(new Error(`EEXIST: ${linkPath}`), {
          code: "EEXIST",
        });
      }
      addDirectory(path.dirname(linkPath));
      links.set(linkPath, target);
    },
    readSymlink: async (linkPath) => links.get(linkPath),
    openPrivateFile: async (file): Promise<PrivateFileHandle> => {
      putFile(file);
      return { write: async () => {}, close: async () => {} };
    },
  };

  return {
    system,
    entries,
    links,
    renames,
    removals,
    putFile,
    hasEntry: (target) => entries.has(target) || links.has(target),
  };
}

interface HarnessOptions {
  platform?: string;
  arch?: string;
  tarResult?: CommandResult;
  nodeVersionOutput?: string;
  downloadError?: Error;
  activateError?: Error;
}

function harness(options: HarnessOptions = {}) {
  const fileSystem = memoryFileSystem();
  const events: string[] = [];
  const invocations: { executable: string; args: readonly string[] }[] = [];
  const downloads: { url: string; destination: string }[] = [];
  const activations: { nodePath: string; version: string }[] = [];

  const installer = new RuntimeInstaller({
    paths: PATHS,
    fileSystem: fileSystem.system,
    platform: options.platform ?? "darwin",
    arch: options.arch ?? "arm64",
    downloader: {
      download: async (artifact, destination) => {
        events.push("download");
        downloads.push({ url: artifact.url, destination });
        if (options.downloadError) {
          throw options.downloadError;
        }
        fileSystem.putFile(destination);
      },
    },
    runner: {
      run: async (executable, args) => {
        invocations.push({ executable, args });
        if (executable === "/usr/bin/tar") {
          events.push("extract");
          const result = options.tarResult ?? { stdout: "", code: 0 };
          if (result.code === 0) {
            fileSystem.putFile(path.join(STAGING_DIR, "bin", "node"));
            fileSystem.putFile(path.join(STAGING_DIR, "bin", "npm"));
          }
          return result;
        }
        if (args[0] === "--version") {
          events.push("verify-version");
          return {
            stdout: options.nodeVersionOutput ?? `v${VERSION}\n`,
            code: 0,
          };
        }
        throw new Error(`unexpected command ${executable}`);
      },
    },
    activator: {
      activate: async (nodePath, version) => {
        events.push("activate-launch-agent");
        activations.push({ nodePath, version });
        if (options.activateError) {
          throw options.activateError;
        }
      },
    },
  });

  return {
    installer,
    fileSystem,
    events,
    invocations,
    downloads,
    activations,
  };
}

describe("runtime installer", () => {
  it("downloads, extracts, verifies, activates, and points current at the pinned version", async () => {
    const context = harness();

    await expect(context.installer.install()).resolves.toEqual({
      version: VERSION,
      nodePath: PATHS.runtimeNode,
      alreadyInstalled: false,
    });

    expect(context.downloads).toEqual([
      {
        url: RELEASES.node.darwin.arm64.url,
        destination: path.join(
          PATHS.downloadsDir,
          `node-v${VERSION}-darwin-arm64.tar.gz`,
        ),
      },
    ]);
    expect(context.fileSystem.links.get(PATHS.runtimeCurrent)).toBe(
      VERSION_DIR,
    );
    expect(
      context.fileSystem.hasEntry(path.join(VERSION_DIR, "bin", "node")),
    ).toBe(true);
    expect(context.fileSystem.hasEntry(STAGING_DIR)).toBe(false);
    expect(context.activations).toEqual([
      { nodePath: PATHS.runtimeNode, version: VERSION },
    ]);
  });

  it("checks the digest, extracts, then verifies the version before any activation", async () => {
    const context = harness();

    await context.installer.install();

    expect(context.events).toEqual([
      "download",
      "extract",
      "verify-version",
      "activate-launch-agent",
    ]);
  });

  it("passes an absolute staged archive and destination to /usr/bin/tar", async () => {
    const context = harness();

    await context.installer.install();

    const extraction = context.invocations[0];
    expect(extraction?.executable).toBe("/usr/bin/tar");
    expect(extraction?.args).toEqual([
      "-xzf",
      path.join(
        PATHS.downloadsDir,
        `node-v${VERSION}-darwin-arm64.tar.gz`,
      ),
      "-C",
      STAGING_DIR,
      "--strip-components",
      "1",
    ]);
    for (const argument of [extraction?.args[1], extraction?.args[3]]) {
      expect(path.isAbsolute(argument ?? "")).toBe(true);
    }
  });

  it("verifies the version by running the staged node, never one from PATH", async () => {
    const context = harness();

    await context.installer.install();

    expect(context.invocations[1]).toEqual({
      executable: path.join(STAGING_DIR, "bin", "node"),
      args: ["--version"],
    });
    for (const invocation of context.invocations) {
      expect(path.isAbsolute(invocation.executable)).toBe(true);
    }
  });

  it("activates through a temporary symlink and an atomic rename", async () => {
    const context = harness();

    await context.installer.install();

    const symlinkRename = context.fileSystem.renames.find(
      ([, destination]) => destination === PATHS.runtimeCurrent,
    );
    expect(symlinkRename).toBeDefined();
    expect(symlinkRename?.[0]).not.toBe(PATHS.runtimeCurrent);
    expect(symlinkRename?.[0].startsWith(`${PATHS.runtimeRoot}/`)).toBe(
      true,
    );
    expect(context.fileSystem.renames).toContainEqual([
      STAGING_DIR,
      VERSION_DIR,
    ]);
  });

  it("selects the x64 artifact and checksum on an Intel Mac", async () => {
    const context = harness({ arch: "x64" });

    await context.installer.install();

    expect(context.downloads[0]?.destination).toBe(
      path.join(PATHS.downloadsDir, `node-v${VERSION}-darwin-x64.tar.gz`),
    );
    expect(context.downloads[0]?.url).toBe(RELEASES.node.darwin.x64.url);
    expect(RELEASES.node.darwin.x64.url).not.toBe(
      RELEASES.node.darwin.arm64.url,
    );
  });

  it("rejects a non-darwin platform before downloading anything", async () => {
    const context = harness({ platform: "linux" });

    await expect(context.installer.install()).rejects.toThrow(/macOS/i);
    expect(context.downloads).toEqual([]);
    expect(context.invocations).toEqual([]);
    expect(context.activations).toEqual([]);
  });

  it("rejects an unsupported architecture before downloading anything", async () => {
    const context = harness({ arch: "ia32" });

    await expect(context.installer.install()).rejects.toThrow(
      /architecture/i,
    );
    expect(context.downloads).toEqual([]);
    expect(context.activations).toEqual([]);
  });

  it("leaves the previous runtime active when the digest does not match", async () => {
    const context = harness({
      downloadError: new Error("archive checksum mismatch"),
    });
    context.fileSystem.putFile(
      path.join(PATHS.runtimeVersion("24.7.0"), "bin", "node"),
    );
    context.fileSystem.links.set(
      PATHS.runtimeCurrent,
      PATHS.runtimeVersion("24.7.0"),
    );

    await expect(context.installer.install()).rejects.toThrow(/checksum/i);

    expect(context.invocations).toEqual([]);
    expect(context.fileSystem.links.get(PATHS.runtimeCurrent)).toBe(
      PATHS.runtimeVersion("24.7.0"),
    );
    expect(context.fileSystem.hasEntry(VERSION_DIR)).toBe(false);
    expect(context.activations).toEqual([]);
  });

  it("leaves the previous runtime active and clears staging when extraction fails", async () => {
    const context = harness({
      tarResult: { stdout: "", stderr: "tar: truncated", code: 1 },
    });
    context.fileSystem.links.set(
      PATHS.runtimeCurrent,
      PATHS.runtimeVersion("24.7.0"),
    );

    await expect(context.installer.install()).rejects.toThrow(
      /tar: truncated/,
    );

    expect(context.fileSystem.links.get(PATHS.runtimeCurrent)).toBe(
      PATHS.runtimeVersion("24.7.0"),
    );
    expect(context.fileSystem.hasEntry(STAGING_DIR)).toBe(false);
    expect(context.fileSystem.hasEntry(VERSION_DIR)).toBe(false);
    expect(context.activations).toEqual([]);
  });

  it("never activates a runtime whose node reports another version", async () => {
    const context = harness({ nodeVersionOutput: "v22.11.0\n" });
    context.fileSystem.links.set(
      PATHS.runtimeCurrent,
      PATHS.runtimeVersion("24.7.0"),
    );

    await expect(context.installer.install()).rejects.toThrow(
      /v24\.8\.0/,
    );

    expect(context.activations).toEqual([]);
    expect(context.fileSystem.links.get(PATHS.runtimeCurrent)).toBe(
      PATHS.runtimeVersion("24.7.0"),
    );
    expect(context.fileSystem.hasEntry(STAGING_DIR)).toBe(false);
    expect(context.fileSystem.hasEntry(VERSION_DIR)).toBe(false);
  });

  it("restores the previous runtime when the LaunchAgent cutover fails", async () => {
    const context = harness({
      activateError: new Error("launchctl bootstrap failed with code 5"),
    });
    const previous = PATHS.runtimeVersion("24.7.0");
    context.fileSystem.putFile(path.join(previous, "bin", "node"));
    context.fileSystem.links.set(PATHS.runtimeCurrent, previous);

    await expect(context.installer.install()).rejects.toThrow(
      /bootstrap failed/,
    );

    expect(context.fileSystem.links.get(PATHS.runtimeCurrent)).toBe(
      previous,
    );
    expect(
      context.fileSystem.hasEntry(path.join(previous, "bin", "node")),
    ).toBe(true);
  });

  it("removes the staged archive after a successful installation", async () => {
    const context = harness();

    await context.installer.install();

    const archive = path.join(
      PATHS.downloadsDir,
      `node-v${VERSION}-darwin-arm64.tar.gz`,
    );
    expect(context.fileSystem.removals).toContain(archive);
    expect(context.fileSystem.hasEntry(archive)).toBe(false);
  });

  it("reuses a healthy installed version instead of downloading again", async () => {
    const context = harness();
    context.fileSystem.putFile(path.join(VERSION_DIR, "bin", "node"));
    context.fileSystem.links.set(PATHS.runtimeCurrent, VERSION_DIR);

    await expect(context.installer.install()).resolves.toEqual({
      version: VERSION,
      nodePath: PATHS.runtimeNode,
      alreadyInstalled: true,
    });

    expect(context.downloads).toEqual([]);
    expect(context.invocations).toEqual([
      {
        executable: path.join(VERSION_DIR, "bin", "node"),
        args: ["--version"],
      },
    ]);
    expect(context.fileSystem.links.get(PATHS.runtimeCurrent)).toBe(
      VERSION_DIR,
    );
    expect(context.activations).toEqual([
      { nodePath: PATHS.runtimeNode, version: VERSION },
    ]);
  });

  it("repairs a current symlink that points somewhere else", async () => {
    const context = harness();
    context.fileSystem.putFile(path.join(VERSION_DIR, "bin", "node"));
    context.fileSystem.links.set(
      PATHS.runtimeCurrent,
      PATHS.runtimeVersion("24.7.0"),
    );

    await expect(context.installer.install()).resolves.toMatchObject({
      alreadyInstalled: true,
    });

    expect(context.fileSystem.links.get(PATHS.runtimeCurrent)).toBe(
      VERSION_DIR,
    );
  });

  it("replaces an installed version directory whose node is unhealthy", async () => {
    let versionCalls = 0;
    const fileSystem = memoryFileSystem();
    fileSystem.putFile(path.join(VERSION_DIR, "bin", "node"));
    fileSystem.links.set(PATHS.runtimeCurrent, VERSION_DIR);
    const downloads: string[] = [];
    const installer = new RuntimeInstaller({
      paths: PATHS,
      fileSystem: fileSystem.system,
      platform: "darwin",
      arch: "arm64",
      downloader: {
        download: async (_artifact, destination) => {
          downloads.push(destination);
          fileSystem.putFile(destination);
        },
      },
      runner: {
        run: async (executable, args) => {
          if (executable === "/usr/bin/tar") {
            fileSystem.putFile(path.join(STAGING_DIR, "bin", "node"));
            return { stdout: "", code: 0 };
          }
          if (args[0] === "--version") {
            versionCalls += 1;
            return versionCalls === 1
              ? { stdout: "", stderr: "dyld: bad image", code: 133 }
              : { stdout: `v${VERSION}\n`, code: 0 };
          }
          throw new Error(`unexpected command ${executable}`);
        },
      },
      activator: { activate: async () => {} },
    });

    await expect(installer.install()).resolves.toMatchObject({
      alreadyInstalled: false,
    });

    expect(downloads).toHaveLength(1);
    expect(fileSystem.links.get(PATHS.runtimeCurrent)).toBe(VERSION_DIR);
    expect(fileSystem.hasEntry(path.join(VERSION_DIR, "bin", "node"))).toBe(
      true,
    );
    expect(fileSystem.hasEntry(PATHS.runtimeDiscarded(VERSION))).toBe(false);
  });
});
