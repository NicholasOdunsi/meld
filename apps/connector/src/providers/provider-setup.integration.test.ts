import { chmod, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import type { Provider, ProviderStatus } from "@meld/contracts";
import { afterEach, describe, expect, it } from "vitest";
import { nodeManagedFileSystem } from "../config/connector-config";
import { connectorPaths, type ConnectorPaths } from "../config/paths";
import type { CommandResult } from "../launchd/command-runner";
import { ProviderDetector } from "./provider-detector";
import {
  managedProviderExecutable,
  PROVIDER_CONFIG_VARIABLE,
} from "./provider-installer";
import { createProcessRunner } from "./process-runner";
import { ProviderSetup, nodeLoginScriptWriter } from "./provider-setup";
import { RELEASES } from "./release-manifest";

/**
 * Provider setup driven end to end through the **real** {@link ProviderSetup}
 * and the **real** {@link ProviderDetector}, against a temporary executable
 * named `codex`/`claude` that speaks each client's own `--version` and status
 * protocol. The visible browser login is the one seam that cannot run under
 * test: the injected `open` runner stands in for it, flipping the fake binary's
 * recorded state to "signed in" exactly as a completed Terminal login would, and
 * the real detector then confirms it through the fake's own status command.
 *
 * Nothing spawns a real provider, opens a real Terminal, or writes to
 * `~/Library/Application Support/Meld`; every managed path lives in a throwaway
 * temporary directory.
 */

const SENTINEL = "MELD_INTEGRATION_SENTINEL_MUST_NOT_LEAK";

const FORBIDDEN_PARENT_VARIABLES = [
  "OPENAI_API_KEY",
  "ANTHROPIC_API_KEY",
  "CODEX_ACCESS_TOKEN",
  "CLAUDE_CODE_OAUTH_TOKEN",
  "CLAUDE_CODE_USE_BEDROCK",
  "AWS_ACCESS_KEY_ID",
  "NODE_OPTIONS",
] as const;

function fakeProviderScript(provider: Provider): string {
  const version =
    provider === "codex" ? "codex-cli 0.146.0" : "2.1.220 (Claude Code)";
  const statusFirst = provider === "codex" ? "login" : "auth";
  const okAuthStatus =
    provider === "codex"
      ? "printf 'Logged in using ChatGPT\\n'"
      : `printf '{"loggedIn":true}\\n'`;
  const signedOutStatus =
    provider === "codex"
      ? "printf 'Not logged in\\n' >&2; exit 1"
      : `printf '{"loggedIn":false}\\n'; exit 0`;

  return [
    "#!/bin/sh",
    "set -u",
    `SENTINEL='${SENTINEL}'`,
    'HOMEDIR="${HOME:-}"',
    "leak() {",
    '  : > "$HOMEDIR/SENTINEL_LEAK" 2>/dev/null || true',
    "  printf 'forbidden material reached the provider child\\n' >&2",
    "  exit 91",
    "}",
    `for v in ${FORBIDDEN_PARENT_VARIABLES.join(" ")}; do`,
    '  eval "value=\\${$v:-}"',
    '  [ -n "$value" ] && leak',
    "done",
    'if /usr/bin/env | /usr/bin/grep -qF "$SENTINEL"; then leak; fi',
    'for a in "$@"; do',
    '  case "$a" in *"$SENTINEL"*) leak ;; esac',
    "done",
    'printf "%s\\n" "$1" >> "$HOMEDIR/calls.log"',
    '/usr/bin/env > "$HOMEDIR/last-env"',
    'MODE="ok"',
    '[ -f "$HOMEDIR/fake-mode" ] && MODE="$(/bin/cat "$HOMEDIR/fake-mode")"',
    'case "$1" in',
    `  --version) printf '${version}\\n'; exit 0 ;;`,
    `  ${statusFirst})`,
    '    if [ "${2:-}" = "status" ]; then',
    '      if [ "$MODE" = "signed_out" ]; then ' + signedOutStatus + "; fi",
    "      " + okAuthStatus + "; exit 0",
    "    fi",
    "    exit 0 ;;",
    "  *) exit 0 ;;",
    "esac",
    "",
  ].join("\n");
}

interface HarnessOptions {
  /** The mode the fake reports before any login. */
  initialMode?: "signed_out" | "ok";
  /** Whether the injected `open` runner flips the fake to signed in. */
  flipOnOpen?: boolean;
  /** How far the injected clock jumps per poll; large values force a timeout. */
  sleepAdvanceMs?: number;
}

interface Harness {
  paths: ConnectorPaths;
  connect(provider: Provider): Promise<ProviderStatus>;
  stages: string[];
  opens: number;
  read(provider: Provider, file: string): Promise<string>;
  leaked(provider: Provider): Promise<boolean>;
}

const temporaryDirectories: string[] = [];

async function makeHarness(options: HarnessOptions = {}): Promise<Harness> {
  const home = await mkdtemp(path.join(tmpdir(), "meld-setup-integration-"));
  temporaryDirectories.push(home);
  const paths = connectorPaths(home);
  const stages: string[] = [];
  let opens = 0;
  let clock = 0;
  let activeProvider: Provider = "codex";

  const detector = new ProviderDetector({
    paths,
    fileSystem: nodeManagedFileSystem,
    processRunner: createProcessRunner(),
  });

  async function layout(provider: Provider): Promise<void> {
    const executable = managedProviderExecutable(
      paths.providerCurrent(provider),
      provider,
    );
    await mkdir(path.dirname(executable), { recursive: true });
    await mkdir(paths.providerHome(provider), { recursive: true });
    await writeFile(executable, fakeProviderScript(provider), "utf8");
    await chmod(executable, 0o755);
    await writeFile(
      path.join(paths.providerHome(provider), "fake-mode"),
      options.initialMode ?? "signed_out",
      "utf8",
    );
  }

  const setup = new ProviderSetup({
    paths,
    fileSystem: nodeManagedFileSystem,
    platform: "darwin",
    runner: {
      run: async (): Promise<CommandResult> => {
        opens += 1;
        if (options.flipOnOpen ?? true) {
          // Stands in for the person completing the official browser login: the
          // fake now reports signed in, which the real detector confirms.
          await writeFile(
            path.join(paths.providerHome(activeProvider), "fake-mode"),
            "ok",
            "utf8",
          );
        }
        return { stdout: "", code: 0 };
      },
    },
    runtimeInstaller: {
      install: async () => ({
        version: RELEASES.node.version,
        nodePath: paths.runtimeNode,
      }),
    },
    providerInstaller: {
      install: async (provider) => {
        await layout(provider);
        return {
          provider,
          version: RELEASES.providers[provider].version,
          executable: managedProviderExecutable(
            paths.providerCurrent(provider),
            provider,
          ),
          alreadyInstalled: false,
        };
      },
    },
    detector,
    scriptWriter: nodeLoginScriptWriter,
    clock: {
      now: () => clock,
      sleep: async (ms) => {
        clock += options.sleepAdvanceMs ?? ms;
      },
    },
  });

  return {
    paths,
    stages,
    get opens() {
      return opens;
    },
    connect: (provider) => {
      activeProvider = provider;
      return setup.connect(provider, (stage) => {
        stages.push(stage);
      });
    },
    read: (provider, file) =>
      readFile(path.join(paths.providerHome(provider), file), "utf8"),
    async leaked(provider) {
      try {
        await readFile(
          path.join(paths.providerHome(provider), "SENTINEL_LEAK"),
          "utf8",
        );
        return true;
      } catch {
        return false;
      }
    },
  };
}

afterEach(async () => {
  await Promise.all(
    temporaryDirectories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("provider setup against a fake provider binary", () => {
  it.each(["codex", "claude"] as const)(
    "installs, authenticates via the visible login, then verifies %s",
    async (provider) => {
      const harness = await makeHarness();

      const status = await harness.connect(provider);

      expect(harness.stages).toEqual([
        "installing",
        "authenticating",
        "verifying",
      ]);
      expect(status).toEqual({
        provider,
        installation: "installed",
        version: RELEASES.providers[provider].version,
        authentication: "authenticated",
        compatibility: "supported",
      });
      expect(harness.opens).toBe(1);
      // The real detector consulted the fake's own `--version` and status
      // commands.
      const calls = await harness.read(provider, "calls.log");
      expect(calls).toContain("--version");
      expect(calls).toContain(provider === "codex" ? "login" : "auth");
      expect(await harness.leaked(provider)).toBe(false);
    },
  );

  it("skips the visible login when the provider is already authenticated", async () => {
    const harness = await makeHarness({ initialMode: "ok" });

    const status = await harness.connect("codex");

    expect(status.authentication).toBe("authenticated");
    expect(harness.opens).toBe(0);
  });

  it("times out honestly when the sign-in is never completed", async () => {
    const harness = await makeHarness({
      flipOnOpen: false,
      sleepAdvanceMs: 200_000,
    });

    await expect(harness.connect("codex")).rejects.toMatchObject({
      name: "ProviderSetupError",
      reason: "authentication-timed-out",
      code: "authentication_failed",
    });
    expect(harness.opens).toBe(1);
  });

  it.each(["codex", "claude"] as const)(
    "runs every %s probe under the managed environment, never a credential",
    async (provider) => {
      const harness = await makeHarness();
      const priorEnvironment = { ...process.env };
      for (const name of FORBIDDEN_PARENT_VARIABLES) {
        process.env[name] = SENTINEL;
      }

      try {
        await harness.connect(provider);
      } finally {
        for (const name of FORBIDDEN_PARENT_VARIABLES) {
          if (priorEnvironment[name] === undefined) {
            delete process.env[name];
          } else {
            process.env[name] = priorEnvironment[name];
          }
        }
      }

      expect(await harness.leaked(provider)).toBe(false);
      const childEnvironment = await harness.read(provider, "last-env");
      expect(childEnvironment).not.toContain(SENTINEL);
      for (const name of FORBIDDEN_PARENT_VARIABLES) {
        expect(childEnvironment).not.toContain(`${name}=`);
      }
      expect(childEnvironment).toContain(
        `HOME=${harness.paths.providerHome(provider)}`,
      );
      expect(childEnvironment).toContain(
        `${PROVIDER_CONFIG_VARIABLE[provider]}=${harness.paths.providerHome(
          provider,
        )}`,
      );
    },
  );
});
