import path from "node:path";
import type { Provider } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import type {
  ManagedFileSystem,
  PrivateFileHandle,
} from "../config/connector-config";
import { connectorPaths, type ConnectorPaths } from "../config/paths";
import type { CommandResult } from "../launchd/command-runner";
import type { ProcessInvocation, ProcessResult } from "./process-runner";
import {
  MAX_DIAGNOSTIC_CHARS,
  ProviderInstaller,
  redactDiagnostic,
} from "./provider-installer";
import { RELEASES } from "./release-manifest";

const PATHS = connectorPaths("/Users/ada");
const CODEX_VERSION = RELEASES.providers.codex.version;
const CLAUDE_VERSION = RELEASES.providers.claude.version;

const BINARY: Record<Provider, string> = {
  codex: "codex",
  claude: "claude",
};

function versionDir(provider: Provider): string {
  return PATHS.providerVersion(provider, RELEASES.providers[provider].version);
}

function executablePath(provider: Provider, root = versionDir(provider)) {
  return path.join(root, "node_modules", ".bin", BINARY[provider]);
}

function lockFile(
  provider: Provider,
  overrides: {
    version?: string;
    integrity?: string;
    resolved?: string;
  } = {},
): string {
  const release = RELEASES.providers[provider];
  return JSON.stringify({
    name: "meld-managed-provider",
    lockfileVersion: 3,
    requires: true,
    packages: {
      "": {
        name: "meld-managed-provider",
        dependencies: { [release.package]: release.version },
      },
      [`node_modules/${release.package}`]: {
        version: overrides.version ?? release.version,
        resolved:
          overrides.resolved ??
          `https://registry.npmjs.org/${release.package}/-/${
            release.package.split("/")[1]
          }-${release.version}.tgz`,
        integrity: overrides.integrity ?? release.integrity,
      },
    },
  });
}

interface MemoryFileSystem {
  system: ManagedFileSystem;
  entries: Map<string, "directory" | "file">;
  files: Map<string, string>;
  links: Map<string, string>;
  removals: string[];
  putFile(file: string, contents?: string): void;
  hasEntry(target: string): boolean;
}

function memoryFileSystem(): MemoryFileSystem {
  const entries = new Map<string, "directory" | "file">();
  const files = new Map<string, string>();
  const links = new Map<string, string>();
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

  function putFile(file: string, contents = ""): void {
    addDirectory(path.dirname(file));
    entries.set(file, "file");
    files.set(file, contents);
  }

  function owned(target: string): string[] {
    const prefix = `${target}/`;
    return [...entries.keys(), ...links.keys()].filter(
      (key) => key === target || key.startsWith(prefix),
    );
  }

  const system: ManagedFileSystem = {
    exists: async (file) => entries.has(file) || links.has(file),
    readText: async (file) => {
      const contents = files.get(file);
      if (contents === undefined) {
        throw Object.assign(new Error(`ENOENT: ${file}`), {
          code: "ENOENT",
        });
      }
      return contents;
    },
    writePrivateText: async (file, contents) => {
      putFile(file, contents);
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
        files.delete(key);
        links.delete(key);
      }
    },
    rename: async (source, destination) => {
      const moved = owned(source);
      if (moved.length === 0) {
        throw Object.assign(new Error(`ENOENT: ${source}`), {
          code: "ENOENT",
        });
      }
      for (const key of owned(destination)) {
        entries.delete(key);
        files.delete(key);
        links.delete(key);
      }
      addDirectory(path.dirname(destination));
      for (const key of moved) {
        const target =
          key === source
            ? destination
            : path.join(destination, key.slice(source.length + 1));
        const kind = entries.get(key);
        if (kind !== undefined) {
          entries.delete(key);
          entries.set(target, kind);
          const contents = files.get(key);
          if (contents !== undefined) {
            files.delete(key);
            files.set(target, contents);
          }
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
    files,
    links,
    removals,
    putFile,
    hasEntry: (target) => entries.has(target) || links.has(target),
  };
}

interface HarnessOptions {
  paths?: ConnectorPaths;
  platform?: string;
  npmResult?: CommandResult;
  /** Written by the fake npm; omit to simulate npm leaving no lock behind. */
  lock?: string | null;
  /** Omit to simulate npm leaving no managed executable behind. */
  installExecutable?: boolean;
  versionOutput?: string;
  versionResponse?: Error;
}

function harness(provider: Provider, options: HarnessOptions = {}) {
  const paths = options.paths ?? PATHS;
  const fileSystem = memoryFileSystem();
  const release = RELEASES.providers[provider];
  const invocations: {
    executable: string;
    args: readonly string[];
    cwd?: string;
    env?: Readonly<Record<string, string>>;
  }[] = [];
  const probes: ProcessInvocation[] = [];
  const events: string[] = [];

  const installer = new ProviderInstaller({
    paths,
    fileSystem: fileSystem.system,
    platform: options.platform ?? "darwin",
    runner: {
      run: async (executable, args, runOptions) => {
        events.push("npm-install");
        invocations.push({
          executable,
          args,
          cwd: runOptions?.cwd,
          env: runOptions?.env,
        });
        const result = options.npmResult ?? { stdout: "", code: 0 };
        if (result.code === 0) {
          const prefixIndex = args.indexOf("--prefix");
          const prefix = args[prefixIndex + 1] ?? "";
          if (options.lock !== null) {
            fileSystem.putFile(
              path.join(prefix, "package-lock.json"),
              options.lock ?? lockFile(provider),
            );
          }
          if (options.installExecutable !== false) {
            fileSystem.putFile(executablePath(provider, prefix));
          }
        }
        return result;
      },
    },
    processRunner: {
      run: async (invocation): Promise<ProcessResult> => {
        events.push("version-probe");
        probes.push(invocation);
        if (options.versionResponse) {
          throw options.versionResponse;
        }
        return {
          stdout:
            options.versionOutput ??
            `${BINARY[provider]}-cli ${release.version}\n`,
          stderr: "",
          code: 0,
          signal: null,
          aborted: false,
          stdoutTruncated: false,
          stderrTruncated: false,
        };
      },
    },
  });

  return { installer, fileSystem, invocations, probes, events, paths };
}

describe("provider installer", () => {
  it("installs codex with the private npm and the exact pinned argv", async () => {
    const context = harness("codex");

    await context.installer.install("codex");

    expect(context.invocations[0]).toMatchObject({
      executable: PATHS.runtimeNpm,
      args: [
        "install",
        "--prefix",
        PATHS.providerVersion("codex", "0.146.0"),
        "--save-exact",
        "--ignore-scripts=false",
        "@openai/codex@0.146.0",
      ],
    });
  });

  it("installs claude with the private npm and the exact pinned argv", async () => {
    const context = harness("claude");

    await context.installer.install("claude");

    expect(context.invocations[0]).toMatchObject({
      executable: PATHS.runtimeNpm,
      args: [
        "install",
        "--prefix",
        PATHS.providerVersion("claude", "2.1.220"),
        "--save-exact",
        "--ignore-scripts=false",
        "@anthropic-ai/claude-code@2.1.220",
      ],
    });
  });

  it("never passes a global flag or resolves a package manager from PATH", async () => {
    const context = harness("codex");

    await context.installer.install("codex");

    for (const invocation of context.invocations) {
      expect(path.isAbsolute(invocation.executable)).toBe(true);
      expect(invocation.executable).toBe(PATHS.runtimeNpm);
      expect(invocation.args).not.toContain("-g");
      expect(invocation.args).not.toContain("--global");
      expect(invocation.args).not.toContain("--location=global");
    }
    for (const probe of context.probes) {
      expect(path.isAbsolute(probe.executable)).toBe(true);
    }
  });

  it("runs npm with a Meld-owned cache and no inherited environment", async () => {
    const context = harness("codex");

    await context.installer.install("codex");

    const env = context.invocations[0]?.env ?? {};
    expect(env.npm_config_cache?.startsWith(`${PATHS.root}/`)).toBe(true);
    expect(env.npm_config_registry).toBe("https://registry.npmjs.org/");
    expect(env.npm_config_userconfig?.startsWith(`${PATHS.root}/`)).toBe(
      true,
    );
    expect(env.npm_config_globalconfig?.startsWith(`${PATHS.root}/`)).toBe(
      true,
    );
    expect(env.PATH).toBe(
      `${path.dirname(PATHS.runtimeNode)}:/usr/bin:/bin`,
    );
    expect(env.HOME).toBe(PATHS.providerHome("codex"));
    expect(Object.keys(env)).not.toContain("OPENAI_API_KEY");
    expect(Object.keys(env)).not.toContain("ANTHROPIC_API_KEY");
    expect(Object.keys(env)).not.toContain("HTTP_PROXY");
  });

  it("activates current only after the lock and version both verify", async () => {
    const context = harness("codex");

    await expect(context.installer.install("codex")).resolves.toEqual({
      provider: "codex",
      version: CODEX_VERSION,
      executable: executablePath("codex"),
      alreadyInstalled: false,
    });

    expect(context.events).toEqual(["npm-install", "version-probe"]);
    expect(context.fileSystem.links.get(PATHS.providerCurrent("codex"))).toBe(
      versionDir("codex"),
    );
  });

  it("probes the managed executable with an isolated provider config directory", async () => {
    const codex = harness("codex");
    await codex.installer.install("codex");

    expect(codex.probes[0]?.executable).toBe(executablePath("codex"));
    expect(codex.probes[0]?.args).toEqual(["--version"]);
    expect(codex.probes[0]?.env.CODEX_HOME).toBe(
      PATHS.providerHome("codex"),
    );

    const claude = harness("claude");
    await claude.installer.install("claude");

    expect(claude.probes[0]?.executable).toBe(executablePath("claude"));
    expect(claude.probes[0]?.env.CLAUDE_CONFIG_DIR).toBe(
      PATHS.providerHome("claude"),
    );
  });

  it("rejects a lock whose resolved version drifted from the manifest", async () => {
    const context = harness("codex", {
      lock: lockFile("codex", { version: "0.147.0" }),
    });
    context.fileSystem.links.set(
      PATHS.providerCurrent("codex"),
      PATHS.providerVersion("codex", "0.145.0"),
    );

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      name: "ProviderInstallError",
      reason: "lock-mismatch",
    });

    expect(context.probes).toEqual([]);
    expect(context.fileSystem.links.get(PATHS.providerCurrent("codex"))).toBe(
      PATHS.providerVersion("codex", "0.145.0"),
    );
    expect(context.fileSystem.hasEntry(versionDir("codex"))).toBe(false);
  });

  it("rejects a lock whose integrity hash does not match the manifest", async () => {
    const context = harness("claude", {
      lock: lockFile("claude", {
        integrity: `sha512-${"A".repeat(86)}==`,
      }),
    });

    await expect(context.installer.install("claude")).rejects.toMatchObject({
      reason: "lock-mismatch",
    });
    expect(
      context.fileSystem.links.get(PATHS.providerCurrent("claude")),
    ).toBeUndefined();
  });

  it("rejects a lock resolved from somewhere other than the npm registry", async () => {
    const context = harness("codex", {
      lock: lockFile("codex", {
        resolved: "https://evil.example.com/codex-0.146.0.tgz",
      }),
    });

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      reason: "lock-mismatch",
    });
  });

  it("rejects a missing or unparsable lock", async () => {
    await expect(
      harness("codex", { lock: null }).installer.install("codex"),
    ).rejects.toMatchObject({ reason: "lock-mismatch" });

    await expect(
      harness("codex", { lock: "not json" }).installer.install("codex"),
    ).rejects.toMatchObject({ reason: "lock-mismatch" });
  });

  it("rejects a prefix outside the managed providers root", async () => {
    const context = harness("codex", {
      paths: {
        ...PATHS,
        providerVersion: () => "/usr/local",
      },
    });

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      reason: "unmanaged-prefix",
    });
    expect(context.invocations).toEqual([]);
  });

  it("rejects an executable that escapes the provider version directory", async () => {
    const context = harness("codex", {
      paths: {
        ...PATHS,
        providerVersion: (provider, version) =>
          `${PATHS.providerVersion(provider, version)}/../../../../../../tmp`,
      },
    });

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      reason: "unmanaged-prefix",
    });
    expect(context.invocations).toEqual([]);
  });

  it("rejects an install that left no managed executable behind", async () => {
    const context = harness("codex", { installExecutable: false });

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      reason: "missing-executable",
    });
    expect(context.probes).toEqual([]);
  });

  it("requires codex --version to contain the pinned version", async () => {
    const context = harness("codex", {
      versionOutput: "codex-cli 0.145.0\n",
    });
    context.fileSystem.links.set(
      PATHS.providerCurrent("codex"),
      PATHS.providerVersion("codex", "0.145.0"),
    );

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      reason: "version-mismatch",
    });
    expect(context.fileSystem.links.get(PATHS.providerCurrent("codex"))).toBe(
      PATHS.providerVersion("codex", "0.145.0"),
    );
  });

  it("requires claude --version to contain the pinned version", async () => {
    const context = harness("claude", {
      versionOutput: "2.1.219 (Claude Code)\n",
    });

    await expect(context.installer.install("claude")).rejects.toMatchObject({
      reason: "version-mismatch",
    });
    expect(CLAUDE_VERSION).toBe("2.1.220");
  });

  it("accepts the real claude --version banner shape", async () => {
    const context = harness("claude", {
      versionOutput: `${CLAUDE_VERSION} (Claude Code)\n`,
    });

    await expect(context.installer.install("claude")).resolves.toMatchObject({
      version: CLAUDE_VERSION,
    });
  });

  it("reports a version failure, not a raw errno, when the probe cannot spawn", async () => {
    const context = harness("codex", {
      versionResponse: Object.assign(new Error("spawn EACCES"), {
        code: "EACCES",
      }),
    });

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      reason: "version-mismatch",
    });
  });

  it("preserves the previous version when npm fails", async () => {
    const context = harness("codex", {
      npmResult: { stdout: "", stderr: "npm ERR! 429", code: 1 },
    });
    const previous = PATHS.providerVersion("codex", "0.145.0");
    context.fileSystem.putFile(executablePath("codex", previous));
    context.fileSystem.links.set(PATHS.providerCurrent("codex"), previous);

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      reason: "install-failed",
    });

    expect(context.fileSystem.links.get(PATHS.providerCurrent("codex"))).toBe(
      previous,
    );
    expect(context.fileSystem.hasEntry(executablePath("codex", previous))).toBe(
      true,
    );
    expect(context.probes).toEqual([]);
  });

  it("never leaks a secret-shaped token from npm output into the failure message", async () => {
    const context = harness("codex", {
      npmResult: {
        stdout: "sk-secret-token-value npm_abcdefghij0123456789",
        stderr: [
          "authorization: Bearer sk-secret-token-value",
          "//registry.npmjs.org/:_authToken=npm_abcdefghij0123456789",
          "eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjM0NTY3ODkwIn0.dozjgNryP4J3jVmNHl",
          '"apiKey": "abcdefghijklmnop"',
        ].join("\n"),
        code: 1,
      },
    });

    const failure = await context.installer
      .install("codex")
      .catch((error: unknown) => error);

    const message = String(failure);
    expect(message).not.toContain("sk-secret-token-value");
    expect(message).not.toContain("npm_abcdefghij0123456789");
    expect(message).not.toContain("eyJhbGciOiJIUzI1NiJ9");
    expect(message).not.toContain("abcdefghijklmnop");
    expect(message).toContain("[redacted]");
  });

  it("keeps npm's own diagnostic so a live failure is actionable", async () => {
    const context = harness("codex", {
      npmResult: {
        stdout: "",
        stderr:
          "npm ERR! code E429\nnpm ERR! 429 Too Many Requests - GET https://registry.npmjs.org/@openai%2fcodex",
        code: 1,
      },
    });

    const failure = await context.installer
      .install("codex")
      .catch((error: unknown) => error);

    const message = failure instanceof Error ? failure.message : "";
    expect(message).toContain("exit code 1");
    expect(message).toContain("E429");
    expect(message).toContain("Too Many Requests");
  });

  it("bounds the kept diagnostic to the tail of the output", async () => {
    const context = harness("codex", {
      npmResult: {
        stdout: "x".repeat(50_000),
        stderr: `${"y".repeat(50_000)}\nnpm ERR! ENOSPC no space left on device`,
        code: 1,
      },
    });

    const failure = await context.installer
      .install("codex")
      .catch((error: unknown) => error);

    const message = failure instanceof Error ? failure.message : "";
    expect(message.length).toBeLessThan(MAX_DIAGNOSTIC_CHARS + 200);
    // The tail is where npm puts its actual verdict.
    expect(message).toContain("npm ERR! ENOSPC no space left on device");
  });

  it("redacts secret shapes but leaves ordinary npm errors intact", () => {
    expect(redactDiagnostic("token: abcdefgh12345678")).toBe(
      "token: [redacted]",
    );
    expect(redactDiagnostic("npm ERR! 429 Too Many Requests")).toBe(
      "npm ERR! 429 Too Many Requests",
    );
    expect(redactDiagnostic("npm ERR! EACCES permission denied")).toBe(
      "npm ERR! EACCES permission denied",
    );
  });

  it("reuses a healthy installed version instead of reinstalling", async () => {
    const context = harness("codex");
    context.fileSystem.putFile(executablePath("codex"));
    context.fileSystem.putFile(
      path.join(versionDir("codex"), "package-lock.json"),
      lockFile("codex"),
    );
    context.fileSystem.links.set(
      PATHS.providerCurrent("codex"),
      versionDir("codex"),
    );

    await expect(context.installer.install("codex")).resolves.toEqual({
      provider: "codex",
      version: CODEX_VERSION,
      executable: executablePath("codex"),
      alreadyInstalled: true,
    });

    expect(context.events).toEqual(["version-probe"]);
  });

  it("reinstalls rather than trusting a tree whose lockfile no longer matches the pin", async () => {
    const context = harness("codex");
    context.fileSystem.putFile(executablePath("codex"));
    context.fileSystem.putFile(
      path.join(versionDir("codex"), "package-lock.json"),
      lockFile("codex", { version: "0.147.0" }),
    );
    context.fileSystem.links.set(
      PATHS.providerCurrent("codex"),
      versionDir("codex"),
    );

    // A drifted tree is never activated on the strength of its binary alone: it
    // is reinstalled, and here npm then produces a lockfile that does match.
    await expect(context.installer.install("codex")).resolves.toMatchObject({
      alreadyInstalled: false,
    });
    expect(context.events[0]).toBe("npm-install");
  });

  it("cannot be retried into accepting a tree whose lockfile was rejected", async () => {
    // The failing install leaves npm's working `.bin/<binary>` behind, and
    // `current` already points at that directory, so nothing is discarded. A
    // second attempt must reach the same verdict instead of reporting success.
    const context = harness("codex", {
      lock: lockFile("codex", { version: "0.147.0" }),
    });
    context.fileSystem.links.set(
      PATHS.providerCurrent("codex"),
      versionDir("codex"),
    );

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      reason: "lock-mismatch",
    });
    expect(context.fileSystem.hasEntry(executablePath("codex"))).toBe(true);

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      reason: "lock-mismatch",
    });
    expect(context.probes).toEqual([]);
    expect(context.events).toEqual(["npm-install", "npm-install"]);
  });

  it("does not reuse an installed tree whose lockfile is unreadable", async () => {
    const context = harness("codex", { lock: "{ truncated" });
    context.fileSystem.putFile(executablePath("codex"));
    context.fileSystem.putFile(
      path.join(versionDir("codex"), "package-lock.json"),
      "{ truncated",
    );
    context.fileSystem.links.set(
      PATHS.providerCurrent("codex"),
      versionDir("codex"),
    );

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      reason: "lock-mismatch",
    });
    expect(context.events[0]).toBe("npm-install");
  });

  it("repoints a current symlink that still targets an older version", async () => {
    const context = harness("codex");
    context.fileSystem.putFile(executablePath("codex"));
    context.fileSystem.putFile(
      path.join(versionDir("codex"), "package-lock.json"),
      lockFile("codex"),
    );
    context.fileSystem.links.set(
      PATHS.providerCurrent("codex"),
      PATHS.providerVersion("codex", "0.145.0"),
    );

    await context.installer.install("codex");

    expect(context.fileSystem.links.get(PATHS.providerCurrent("codex"))).toBe(
      versionDir("codex"),
    );
  });

  it("rejects a non-darwin platform before running anything", async () => {
    const context = harness("codex", { platform: "linux" });

    await expect(context.installer.install("codex")).rejects.toMatchObject({
      name: "ProviderInstallError",
      reason: "unsupported-platform",
    });
    expect(context.invocations).toEqual([]);
    expect(context.probes).toEqual([]);
  });
});
