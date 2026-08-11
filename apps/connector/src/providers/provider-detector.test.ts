import path from "node:path";
import type { Provider, ProviderStatus } from "@meld/contracts";
import { describe, expect, it } from "vitest";
import type { ManagedFileSystem } from "../config/connector-config";
import { connectorPaths } from "../config/paths";
import { ProviderDetector } from "./provider-detector";
import type { ProcessInvocation, ProcessResult } from "./process-runner";
import { RELEASES } from "./release-manifest";

const PATHS = connectorPaths("/Users/ada");

const BINARY: Record<Provider, string> = {
  codex: "codex",
  claude: "claude",
};

function managedExecutable(provider: Provider): string {
  return path.join(
    PATHS.providerCurrent(provider),
    "node_modules",
    ".bin",
    BINARY[provider],
  );
}

function result(overrides: Partial<ProcessResult> = {}): ProcessResult {
  return {
    stdout: "",
    stderr: "",
    code: 0,
    signal: null,
    aborted: false,
    stdoutTruncated: false,
    stderrTruncated: false,
    ...overrides,
  };
}

interface HarnessOptions {
  installed?: Provider[];
  /** Keyed by the first argument of the probe: `--version` or the status verb. */
  responses?: Partial<Record<string, ProcessResult | Error>>;
}

function harness(options: HarnessOptions = {}) {
  const installed = new Set<Provider>(
    options.installed ?? ["codex", "claude"],
  );
  const probes: ProcessInvocation[] = [];
  const reads: string[] = [];

  const fileSystem = {
    exists: async (file: string) =>
      [...installed].some((provider) => managedExecutable(provider) === file),
    readText: async (file: string) => {
      reads.push(file);
      throw new Error("the detector must never read provider files");
    },
    writePrivateText: async () => {
      throw new Error("unexpected writePrivateText");
    },
    copyFile: async () => {
      throw new Error("unexpected copyFile");
    },
    makeDirectory: async () => {},
    removeTree: async () => {},
    rename: async () => {},
    createSymlink: async () => {},
    readSymlink: async () => undefined,
    openPrivateFile: async () => {
      throw new Error("unexpected openPrivateFile");
    },
  } satisfies ManagedFileSystem;

  const detector = new ProviderDetector({
    paths: PATHS,
    fileSystem,
    processRunner: {
      run: async (invocation) => {
        probes.push(invocation);
        const key = invocation.args[0] ?? "";
        const provider = invocation.executable.includes("/codex/")
          ? "codex"
          : "claude";
        const response = options.responses?.[key];
        if (response instanceof Error) {
          throw response;
        }
        if (response) {
          return response;
        }
        if (key === "--version") {
          return result({
            stdout: `${BINARY[provider]}-cli ${
              RELEASES.providers[provider].version
            }\n`,
          });
        }
        return result({
          stdout:
            provider === "claude"
              ? '{"loggedIn":true,"authMethod":"claude.ai","subscriptionType":"pro"}'
              : "Logged in using ChatGPT\n",
        });
      },
    },
  });

  return { detector, probes, reads };
}

describe("provider detector", () => {
  it("reports a provider that is not installed without probing anything", async () => {
    const context = harness({ installed: [] });

    await expect(context.detector.detect("codex")).resolves.toEqual({
      provider: "codex",
      installation: "not_installed",
      version: null,
      authentication: "unknown",
      compatibility: "unavailable",
    } satisfies ProviderStatus);
    expect(context.probes).toEqual([]);
  });

  it("reports codex as installed, authenticated, and supported", async () => {
    const context = harness();

    await expect(context.detector.detect("codex")).resolves.toEqual({
      provider: "codex",
      installation: "installed",
      version: RELEASES.providers.codex.version,
      models: RELEASES.providers.codex.models,
      defaultModel: RELEASES.providers.codex.defaultModel,
      authentication: "authenticated",
      compatibility: "supported",
    } satisfies ProviderStatus);
  });

  it("verifies codex with its own login status command", async () => {
    const context = harness({ installed: ["codex"] });

    await context.detector.detect("codex");

    expect(context.probes[0]).toMatchObject({
      executable: managedExecutable("codex"),
      args: ["--version"],
    });
    expect(context.probes[1]).toMatchObject({
      executable: managedExecutable("codex"),
      args: ["login", "status"],
    });
  });

  it("verifies claude with its own auth status command", async () => {
    const context = harness({ installed: ["claude"] });

    await expect(context.detector.detect("claude")).resolves.toMatchObject({
      authentication: "authenticated",
      installation: "installed",
      compatibility: "supported",
    });
    expect(context.probes[1]).toMatchObject({
      executable: managedExecutable("claude"),
      args: ["auth", "status"],
    });
  });

  it("treats a non-zero status exit code as signed out", async () => {
    const context = harness({
      installed: ["codex"],
      responses: {
        login: result({ stderr: "Not logged in", code: 1 }),
      },
    });

    await expect(context.detector.detect("codex")).resolves.toMatchObject({
      installation: "installed",
      authentication: "signed_out",
      compatibility: "supported",
    });
  });

  it("treats claude's loggedIn false verdict as signed out", async () => {
    const context = harness({
      installed: ["claude"],
      responses: {
        auth: result({ stdout: '{"loggedIn":false}' }),
      },
    });

    await expect(context.detector.detect("claude")).resolves.toMatchObject({
      authentication: "signed_out",
    });
  });

  it("reports unknown authentication when claude's verdict cannot be read", async () => {
    const context = harness({
      installed: ["claude"],
      responses: { auth: result({ stdout: "not json at all" }) },
    });

    await expect(context.detector.detect("claude")).resolves.toMatchObject({
      installation: "installed",
      authentication: "unknown",
    });
  });

  it("reports an update requirement and skips the status probe on a version drift", async () => {
    const context = harness({
      installed: ["codex"],
      responses: { "--version": result({ stdout: "codex-cli 0.140.0\n" }) },
    });

    await expect(context.detector.detect("codex")).resolves.toEqual({
      provider: "codex",
      installation: "update_required",
      version: "0.140.0",
      authentication: "unknown",
      compatibility: "outdated",
    } satisfies ProviderStatus);
    expect(context.probes).toHaveLength(1);
  });

  it("reports a failed installation when the managed binary cannot be spawned", async () => {
    const context = harness({
      installed: ["codex"],
      responses: {
        "--version": Object.assign(new Error("spawn ENOEXEC"), {
          code: "ENOEXEC",
        }),
      },
    });

    await expect(context.detector.detect("codex")).resolves.toEqual({
      provider: "codex",
      installation: "failed",
      version: null,
      authentication: "unknown",
      compatibility: "unavailable",
    } satisfies ProviderStatus);
  });

  it("reports unknown authentication when the status probe cannot be spawned", async () => {
    const context = harness({
      installed: ["codex"],
      responses: {
        login: Object.assign(new Error("spawn EACCES"), { code: "EACCES" }),
      },
    });

    await expect(context.detector.detect("codex")).resolves.toMatchObject({
      installation: "installed",
      authentication: "unknown",
    });
  });

  it("probes only absolute managed binaries with isolated provider homes", async () => {
    const context = harness();

    await context.detector.detectAll();

    expect(context.probes).toHaveLength(4);
    for (const probe of context.probes) {
      expect(path.isAbsolute(probe.executable)).toBe(true);
      expect(probe.executable.startsWith(`${PATHS.providersRoot}/`)).toBe(
        true,
      );
      // Claude probes lead with the `security` shim so the auth-status check
      // reads the file store, exactly as the login and task runs do.
      const expectedPath = probe.executable.includes("/claude/")
        ? `${PATHS.securityShimDir}:${path.dirname(PATHS.runtimeNode)}:/usr/bin:/bin`
        : `${path.dirname(PATHS.runtimeNode)}:/usr/bin:/bin`;
      expect(probe.env.PATH).toBe(expectedPath);
      expect(Object.keys(probe.env)).not.toContain("OPENAI_API_KEY");
      expect(Object.keys(probe.env)).not.toContain("ANTHROPIC_API_KEY");
    }
    expect(
      context.probes
        .filter((probe) => probe.executable.includes("/codex/"))
        .every((probe) => probe.env.CODEX_HOME === PATHS.providerHome("codex")),
    ).toBe(true);
    expect(
      context.probes
        .filter((probe) => probe.executable.includes("/claude/"))
        .every(
          (probe) =>
            probe.env.CLAUDE_CONFIG_DIR === PATHS.providerHome("claude"),
        ),
    ).toBe(true);
  });

  it("reports both providers, including one that is not installed", async () => {
    const context = harness({ installed: ["claude"] });

    await expect(context.detector.detectAll()).resolves.toEqual([
      {
        provider: "codex",
        installation: "not_installed",
        version: null,
        authentication: "unknown",
        compatibility: "unavailable",
      },
      {
        provider: "claude",
        installation: "installed",
        version: RELEASES.providers.claude.version,
        models: RELEASES.providers.claude.models,
        defaultModel: RELEASES.providers.claude.defaultModel,
        authentication: "authenticated",
        compatibility: "supported",
      },
    ] satisfies ProviderStatus[]);
  });

  it("never reads a credential file and never carries provider output into the status", async () => {
    const secret = "eyJhbGciOiJIUzI1NiJ9.secret-account-token";
    const context = harness({
      installed: ["claude"],
      responses: {
        auth: result({
          stdout: `{"loggedIn":true,"accessToken":"${secret}"}`,
          stderr: secret,
        }),
      },
    });

    const status = await context.detector.detect("claude");

    expect(JSON.stringify(status)).not.toContain(secret);
    expect(context.reads).toEqual([]);
  });
});
