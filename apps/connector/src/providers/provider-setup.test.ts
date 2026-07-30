import { mkdtemp, readFile, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Provider, ProviderStatus } from "@meld/contracts";
import { afterEach, describe, expect, it } from "vitest";
import type { ManagedFileSystem } from "../config/connector-config";
import { connectorPaths, type ConnectorPaths } from "../config/paths";
import type { CommandResult } from "../launchd/command-runner";
import { ProviderInstallError } from "./provider-installer";
import {
  LOGIN_POLL_INTERVAL_MS,
  LOGIN_TIMEOUT_MS,
  MAX_UNREADABLE_VERDICTS,
  ProviderSetup,
  ProviderSetupError,
  launchAgentRuntimeActivator,
  nodeLoginScriptWriter,
} from "./provider-setup";
import { RELEASES } from "./release-manifest";
import { RuntimeInstallError } from "./runtime-installer";

const PATHS = connectorPaths("/Users/ada");

const BINARY: Record<Provider, string> = {
  codex: "codex",
  claude: "claude",
};

function managedExecutable(
  provider: Provider,
  paths: ConnectorPaths = PATHS,
): string {
  return path.join(
    paths.providerVersion(provider, RELEASES.providers[provider].version),
    "node_modules",
    ".bin",
    BINARY[provider],
  );
}

function status(
  provider: Provider,
  overrides: Partial<ProviderStatus> = {},
): ProviderStatus {
  return {
    provider,
    installation: "installed",
    version: RELEASES.providers[provider].version,
    authentication: "authenticated",
    compatibility: "supported",
    ...overrides,
  };
}

const temporaryDirectories: string[] = [];

async function temporaryHome(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "meld-provider-setup-"));
  temporaryDirectories.push(directory);
  return directory;
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

interface HarnessOptions {
  paths?: ConnectorPaths;
  platform?: string;
  /** Consumed in order; the last entry repeats forever. */
  statuses?: ProviderStatus[];
  openResult?: CommandResult;
  openError?: Error;
  runtimeInstallError?: Error;
  providerInstallError?: Error;
  writeError?: Error;
}

function harness(provider: Provider, options: HarnessOptions = {}) {
  const paths = options.paths ?? PATHS;
  const stages: string[] = [];
  const events: string[] = [];
  const invocations: { executable: string; args: readonly string[] }[] = [];
  const writes: { file: string; contents: string; mode: number }[] = [];
  const removals: string[] = [];
  const sleeps: number[] = [];
  const directories: string[] = [];
  const statuses = [...(options.statuses ?? [status(provider)])];
  let clock = 0;

  const fileSystem = {
    exists: async () => false,
    readText: async () => {
      throw new Error("provider setup must never read a credential file");
    },
    writePrivateText: async () => {
      throw new Error("unexpected writePrivateText");
    },
    copyFile: async () => {
      throw new Error("unexpected copyFile");
    },
    makeDirectory: async (directory: string) => {
      directories.push(directory);
    },
    removeTree: async () => {},
    rename: async () => {},
    createSymlink: async () => {},
    readSymlink: async () => undefined,
    openPrivateFile: async () => {
      throw new Error("unexpected openPrivateFile");
    },
  } satisfies ManagedFileSystem;

  const setup = new ProviderSetup({
    paths,
    fileSystem,
    platform: options.platform ?? "darwin",
    runner: {
      run: async (executable, args) => {
        events.push("open-terminal");
        invocations.push({ executable, args });
        if (options.openError) {
          throw options.openError;
        }
        return options.openResult ?? { stdout: "", code: 0 };
      },
    },
    runtimeInstaller: {
      install: async () => {
        events.push("install-runtime");
        if (options.runtimeInstallError) {
          throw options.runtimeInstallError;
        }
        return { version: RELEASES.node.version, nodePath: paths.runtimeNode };
      },
    },
    providerInstaller: {
      install: async (requested) => {
        events.push("install-provider");
        if (options.providerInstallError) {
          throw options.providerInstallError;
        }
        return {
          provider: requested,
          version: RELEASES.providers[requested].version,
          executable: managedExecutable(requested, paths),
          alreadyInstalled: false,
        };
      },
    },
    detector: {
      detect: async () => {
        events.push("detect");
        return statuses.length > 1
          ? (statuses.shift() as ProviderStatus)
          : (statuses[0] as ProviderStatus);
      },
    },
    scriptWriter: {
      write: async (file, contents, mode) => {
        events.push("write-login-script");
        if (options.writeError) {
          throw options.writeError;
        }
        writes.push({ file, contents, mode });
      },
      remove: async (file) => {
        events.push("remove-login-script");
        removals.push(file);
      },
    },
    clock: {
      now: () => clock,
      sleep: async (ms) => {
        sleeps.push(ms);
        clock += ms;
      },
    },
  });

  return {
    setup,
    stages,
    events,
    invocations,
    writes,
    removals,
    sleeps,
    directories,
    onProgress: (stage: string) => {
      stages.push(stage);
    },
  };
}

describe("provider setup", () => {
  it("reports installing, authenticating, then verifying for codex", async () => {
    const context = harness("codex", {
      statuses: [
        status("codex", { authentication: "signed_out" }),
        status("codex"),
      ],
    });

    await context.setup.connect("codex", context.onProgress);

    expect(context.stages).toEqual([
      "installing",
      "authenticating",
      "verifying",
    ]);
  });

  it("reports installing, authenticating, then verifying for claude", async () => {
    const context = harness("claude", {
      statuses: [
        status("claude", { authentication: "signed_out" }),
        status("claude"),
      ],
    });

    await context.setup.connect("claude", context.onProgress);

    expect(context.stages).toEqual([
      "installing",
      "authenticating",
      "verifying",
    ]);
  });

  it("installs the private runtime before the provider", async () => {
    const context = harness("codex", {
      statuses: [
        status("codex", { authentication: "signed_out" }),
        status("codex"),
      ],
    });

    await context.setup.connect("codex", context.onProgress);

    expect(context.events.slice(0, 3)).toEqual([
      "install-runtime",
      "install-provider",
      "detect",
    ]);
  });

  it("returns an installed, authenticated, supported status", async () => {
    const context = harness("codex", {
      statuses: [
        status("codex", { authentication: "signed_out" }),
        status("codex"),
      ],
    });

    await expect(
      context.setup.connect("codex", context.onProgress),
    ).resolves.toEqual({
      provider: "codex",
      installation: "installed",
      version: RELEASES.providers.codex.version,
      authentication: "authenticated",
      compatibility: "supported",
    } satisfies ProviderStatus);
  });

  it("writes the exact codex login script at mode 0700 with no credential", async () => {
    const context = harness("codex", {
      statuses: [
        status("codex", { authentication: "signed_out" }),
        status("codex"),
      ],
    });

    await context.setup.connect("codex", context.onProgress);

    const write = context.writes[0];
    expect(write?.file).toBe(PATHS.providerLoginCommand);
    expect(write?.mode).toBe(0o700);
    expect(write?.contents).toBe(
      [
        "#!/bin/sh",
        `export CODEX_HOME='${PATHS.providerHome("codex")}'`,
        `exec '${managedExecutable("codex")}' login`,
        "",
      ].join("\n"),
    );
    expect(write?.contents).toContain(PATHS.providerHome("codex"));
    expect(write?.contents).toMatch(/exec '\/Users\/ada\/Library\//);
    expect(write?.contents).not.toMatch(
      /token|secret|password|api[_-]?key|credential|Keychain/i,
    );
  });

  it("writes the exact claude login script at mode 0700 with no credential", async () => {
    const context = harness("claude", {
      statuses: [
        status("claude", { authentication: "signed_out" }),
        status("claude"),
      ],
    });

    await context.setup.connect("claude", context.onProgress);

    expect(context.writes[0]?.contents).toBe(
      [
        "#!/bin/sh",
        `export CLAUDE_CONFIG_DIR='${PATHS.providerHome("claude")}'`,
        `exec '${managedExecutable("claude")}' auth login`,
        "",
      ].join("\n"),
    );
    expect(context.writes[0]?.mode).toBe(0o700);
    expect(context.writes[0]?.contents).not.toMatch(
      /token|secret|password|api[_-]?key|credential/i,
    );
  });

  it("escapes single quotes in managed paths", async () => {
    const paths = connectorPaths("/Users/ada's mac");
    const context = harness("codex", {
      paths,
      statuses: [
        status("codex", { authentication: "signed_out" }),
        status("codex"),
      ],
    });

    await context.setup.connect("codex", context.onProgress);

    const contents = context.writes[0]?.contents ?? "";
    expect(contents).toContain(
      `export CODEX_HOME='${paths.providerHome("codex").replaceAll(
        "'",
        String.raw`'\''`,
      )}'`,
    );
    // Every quoted path closes exactly the quote it opened, so the shell sees
    // one word per path rather than an injected command.
    expect(contents.split("'").length % 2).toBe(1);
    expect(contents).not.toContain("ada's mac'");
  });

  it("opens the login script visibly with /usr/bin/open -a Terminal", async () => {
    const context = harness("codex", {
      statuses: [
        status("codex", { authentication: "signed_out" }),
        status("codex"),
      ],
    });

    await context.setup.connect("codex", context.onProgress);

    expect(context.invocations).toEqual([
      {
        executable: "/usr/bin/open",
        args: ["-a", "Terminal", PATHS.providerLoginCommand],
      },
    ]);
    expect(context.events.indexOf("write-login-script")).toBeLessThan(
      context.events.indexOf("open-terminal"),
    );
  });

  it("deletes the login script once login resolves", async () => {
    const context = harness("codex", {
      statuses: [
        status("codex", { authentication: "signed_out" }),
        status("codex"),
      ],
    });

    await context.setup.connect("codex", context.onProgress);

    expect(context.removals).toEqual([PATHS.providerLoginCommand]);
    expect(context.events.at(-1)).not.toBe("write-login-script");
    expect(context.events).toContain("remove-login-script");
  });

  it("skips the visible login when the provider is already authenticated", async () => {
    const context = harness("codex", { statuses: [status("codex")] });

    await expect(
      context.setup.connect("codex", context.onProgress),
    ).resolves.toMatchObject({ authentication: "authenticated" });

    expect(context.stages).toEqual([
      "installing",
      "authenticating",
      "verifying",
    ]);
    expect(context.invocations).toEqual([]);
    expect(context.writes).toEqual([]);
  });

  it("polls the official status command every two seconds until it authenticates", async () => {
    const context = harness("codex", {
      statuses: [
        status("codex", { authentication: "signed_out" }),
        status("codex", { authentication: "signed_out" }),
        status("codex", { authentication: "signed_out" }),
        status("codex"),
      ],
    });

    await context.setup.connect("codex", context.onProgress);

    expect(LOGIN_POLL_INTERVAL_MS).toBe(2_000);
    expect(context.sleeps).toEqual([2_000, 2_000]);
  });

  it("times out after ten minutes of polling and reports a typed failure", async () => {
    const context = harness("codex", {
      statuses: [status("codex", { authentication: "signed_out" })],
    });

    const failure = await context.setup
      .connect("codex", context.onProgress)
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProviderSetupError);
    expect(failure).toMatchObject({
      name: "ProviderSetupError",
      reason: "authentication-timed-out",
      code: "authentication_failed",
    });
    expect(LOGIN_TIMEOUT_MS).toBe(10 * 60 * 1_000);
    expect(context.sleeps.length).toBe(LOGIN_TIMEOUT_MS / 2_000 - 1);
    expect(context.removals).toEqual([PATHS.providerLoginCommand]);
  });

  it("reports a typed failure and deletes the script when Terminal cannot be opened", async () => {
    const context = harness("codex", {
      statuses: [status("codex", { authentication: "signed_out" })],
      openResult: { stdout: "", stderr: "Unable to find application", code: 1 },
    });

    await expect(
      context.setup.connect("codex", context.onProgress),
    ).rejects.toMatchObject({
      name: "ProviderSetupError",
      reason: "authentication-failed",
      code: "authentication_failed",
    });

    expect(context.removals).toEqual([PATHS.providerLoginCommand]);
    expect(context.sleeps).toEqual([]);
  });

  it("reports a typed failure when the login script cannot even be written", async () => {
    const context = harness("codex", {
      statuses: [status("codex", { authentication: "signed_out" })],
      writeError: Object.assign(new Error("EROFS: read-only file system"), {
        code: "EROFS",
      }),
    });

    await expect(
      context.setup.connect("codex", context.onProgress),
    ).rejects.toMatchObject({ reason: "authentication-failed" });
    expect(context.invocations).toEqual([]);
  });

  it("reports a signed-out provider that never completes login as an authentication failure", async () => {
    const context = harness("claude", {
      statuses: [status("claude", { authentication: "signed_out" })],
    });

    await expect(
      context.setup.connect("claude", context.onProgress),
    ).rejects.toMatchObject({ code: "authentication_failed" });
  });

  it("maps a runtime install failure to its own typed code", async () => {
    const context = harness("codex", {
      runtimeInstallError: new RuntimeInstallError(
        "version-mismatch",
        "The extracted private Node runtime did not report v24.8.0.",
      ),
    });

    await expect(
      context.setup.connect("codex", context.onProgress),
    ).rejects.toMatchObject({
      reason: "runtime-install-failed",
      code: "runtime_install_failed",
    });
    expect(context.stages).toEqual(["installing"]);
    expect(context.events).toEqual(["install-runtime"]);
  });

  it("maps a bad provider version to a provider install failure", async () => {
    const context = harness("codex", {
      providerInstallError: new ProviderInstallError(
        "version-mismatch",
        "The managed codex did not report 0.146.0.",
      ),
    });

    await expect(
      context.setup.connect("codex", context.onProgress),
    ).rejects.toMatchObject({
      reason: "provider-install-failed",
      code: "provider_install_failed",
    });
    expect(context.stages).toEqual(["installing"]);
    expect(context.invocations).toEqual([]);
  });

  it("fails verification when the final status is not installed and supported", async () => {
    const context = harness("codex", {
      statuses: [
        status("codex", {
          installation: "update_required",
          compatibility: "outdated",
        }),
      ],
    });

    await expect(
      context.setup.connect("codex", context.onProgress),
    ).rejects.toMatchObject({
      reason: "verification-failed",
      code: "verification_failed",
    });
    expect(context.stages).toEqual([
      "installing",
      "authenticating",
      "verifying",
    ]);
  });

  it("rejects a non-darwin platform before installing or opening anything", async () => {
    const context = harness("codex", { platform: "linux" });

    await expect(
      context.setup.connect("codex", context.onProgress),
    ).rejects.toMatchObject({
      reason: "unsupported-platform",
      code: "unsupported_platform",
    });
    expect(context.events).toEqual([]);
    expect(context.stages).toEqual([]);
  });

  it("fails fast, and honestly, when the sign-in verdict cannot be read", async () => {
    const context = harness("claude", {
      statuses: [status("claude", { authentication: "unknown" })],
    });

    const failure = await context.setup
      .connect("claude", context.onProgress)
      .catch((error: unknown) => error);

    expect(failure).toMatchObject({
      name: "ProviderSetupError",
      reason: "authentication-indeterminate",
      code: "authentication_failed",
    });
    // Prompt: three unreadable verdicts, not the full ten-minute window.
    expect(context.sleeps).toEqual([2_000, 2_000]);
    expect(context.sleeps.length).toBeLessThan(LOGIN_TIMEOUT_MS / 2_000 - 1);
    expect(MAX_UNREADABLE_VERDICTS).toBe(3);

    // The message must not tell a possibly signed-in person that they failed to
    // sign in within ten minutes.
    const message = failure instanceof Error ? failure.message : "";
    expect(message).not.toMatch(/ten minutes/i);
    expect(message).toMatch(/could not read/i);
    expect(context.removals).toEqual([PATHS.providerLoginCommand]);
  });

  it("tolerates unreadable verdicts that a definite verdict interrupts", async () => {
    const context = harness("claude", {
      statuses: [
        status("claude", { authentication: "unknown" }),
        status("claude", { authentication: "unknown" }),
        status("claude", { authentication: "signed_out" }),
        status("claude", { authentication: "unknown" }),
        status("claude", { authentication: "unknown" }),
        status("claude"),
      ],
    });

    await expect(
      context.setup.connect("claude", context.onProgress),
    ).resolves.toMatchObject({ authentication: "authenticated" });

    expect(context.sleeps).toEqual([2_000, 2_000, 2_000, 2_000]);
  });

  it("reports a cancelled setup without installing anything", async () => {
    const context = harness("codex");
    const controller = new AbortController();
    controller.abort();

    await expect(
      context.setup.connect("codex", context.onProgress, controller.signal),
    ).rejects.toMatchObject({ reason: "cancelled", code: "cancelled" });
    expect(context.events).toEqual([]);
  });

  it("stops polling and deletes the login script when the setup is cancelled", async () => {
    const controller = new AbortController();
    const context = harness("codex", {
      statuses: [status("codex", { authentication: "signed_out" })],
    });

    const running = context.setup.connect(
      "codex",
      (stage) => {
        context.onProgress(stage);
        if (stage === "authenticating") {
          controller.abort();
        }
      },
      controller.signal,
    );

    await expect(running).rejects.toMatchObject({ reason: "cancelled" });
    expect(context.stages).toEqual(["installing", "authenticating"]);
  });

  it("never leaks the login script path or provider output into a failure message", async () => {
    const context = harness("codex", {
      statuses: [status("codex", { authentication: "signed_out" })],
      openResult: {
        stdout: "",
        stderr: "device code ABCD-1234 for /Users/ada/.codex/auth.json",
        code: 1,
      },
    });

    const failure = await context.setup
      .connect("codex", context.onProgress)
      .catch((error: unknown) => error);

    const message = failure instanceof Error ? failure.message : "";
    expect(message).not.toContain("ABCD-1234");
    expect(message).not.toContain("auth.json");
    expect(message).not.toContain(PATHS.providerLoginCommand);
  });
});

describe("login script writer", () => {
  it("writes an owner-only executable script and removes it again", async () => {
    const home = await temporaryHome();
    const file = path.join(home, "state", "provider-login.command");

    await nodeLoginScriptWriter.write(file, "#!/bin/sh\nexit 0\n", 0o700);

    expect((await stat(file)).mode & 0o777).toBe(0o700);
    expect(await readFile(file, "utf8")).toBe("#!/bin/sh\nexit 0\n");

    await nodeLoginScriptWriter.remove(file);
    await expect(stat(file)).rejects.toMatchObject({ code: "ENOENT" });
    await expect(
      nodeLoginScriptWriter.remove(file),
    ).resolves.toBeUndefined();
  });

  it("re-asserts mode 0700 over a leftover script from an earlier attempt", async () => {
    const home = await temporaryHome();
    const file = path.join(home, "provider-login.command");

    await nodeLoginScriptWriter.write(file, "first", 0o600);
    await nodeLoginScriptWriter.write(file, "second", 0o700);

    expect((await stat(file)).mode & 0o777).toBe(0o700);
    expect(await readFile(file, "utf8")).toBe("second");
  });
});

describe("launch agent runtime activator", () => {
  it("cuts the LaunchAgent over to the managed node once it reports the pinned version", async () => {
    const home = await temporaryHome();
    const paths = connectorPaths(home);
    const invocations: { command: string; args: string[] }[] = [];

    const activator = launchAgentRuntimeActivator(paths, {
      run: async (command, args) => {
        invocations.push({ command, args });
        if (command === paths.runtimeNode) {
          return { stdout: `v${RELEASES.node.version}\n`, code: 0 };
        }
        if (args[0] === "print") {
          return { stdout: "", stderr: "No such process", code: 3 };
        }
        return { stdout: "", code: 0 };
      },
    });

    await activator.activate(paths.runtimeNode, RELEASES.node.version);

    expect(invocations[0]).toEqual({
      command: paths.runtimeNode,
      args: ["--version"],
    });
    const plist = await readFile(paths.plistFile, "utf8");
    expect(plist).toContain(paths.runtimeNode);
    expect(plist).toContain(paths.agentEntry);
    expect(
      invocations.some(
        (invocation) =>
          invocation.command === "launchctl" &&
          invocation.args[0] === "bootstrap",
      ),
    ).toBe(true);
  });

  it("never touches launchctl or the plist when the managed node reports another version", async () => {
    const home = await temporaryHome();
    const paths = connectorPaths(home);
    const invocations: string[] = [];

    const activator = launchAgentRuntimeActivator(paths, {
      run: async (command) => {
        invocations.push(command);
        return { stdout: "v22.11.0\n", code: 0 };
      },
    });

    await expect(
      activator.activate(paths.runtimeNode, RELEASES.node.version),
    ).rejects.toThrow(/v24\.8\.0/);

    expect(invocations).toEqual([paths.runtimeNode]);
    await expect(stat(paths.plistFile)).rejects.toMatchObject({
      code: "ENOENT",
    });
  });

  it("forwards the pinned runtime version the installer reports", async () => {
    const home = await temporaryHome();
    const paths = connectorPaths(home);
    const versions: string[] = [];

    const activator = launchAgentRuntimeActivator(paths, {
      run: async (command, args) => {
        if (command === paths.runtimeNode) {
          versions.push(args[0] ?? "");
          return { stdout: "v0.0.0\n", code: 0 };
        }
        throw new Error("the cutover must not reach launchctl");
      },
    });

    await expect(
      activator.activate(paths.runtimeNode, "24.8.0"),
    ).rejects.toThrow(/24\.8\.0/);
    expect(versions).toEqual(["--version"]);
    expect(RELEASES.node.version).toBe("24.8.0");
  });
});
