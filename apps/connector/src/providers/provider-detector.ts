import path from "node:path";
import {
  ProviderSchema,
  type Provider,
  type ProviderStatus,
} from "@meld/contracts";
import { z } from "zod";
import type { ManagedFileSystem } from "../config/connector-config";
import type { ConnectorPaths } from "../config/paths";
import type { ProcessRunner } from "./process-runner";
import {
  managedProviderEnvironment,
  managedProviderExecutable,
} from "./provider-installer";
import { providerRelease } from "./release-manifest";

const SEMVER = /\b(\d+\.\d+\.\d+)\b/;

/**
 * Each provider's own status command. Meld's only evidence of authentication is
 * this command's exit code and, for Claude, the verdict it prints; no credential
 * file and no Keychain item is ever read.
 */
const STATUS_COMMAND: Record<Provider, readonly string[]> = {
  codex: ["login", "status"],
  claude: ["auth", "status"],
};

const ClaudeStatusSchema = z.object({ loggedIn: z.boolean() });

export interface ProviderDetectorDependencies {
  paths: ConnectorPaths;
  fileSystem: ManagedFileSystem;
  processRunner: ProcessRunner;
}

function notInstalled(provider: Provider): ProviderStatus {
  return {
    provider,
    installation: "not_installed",
    version: null,
    authentication: "unknown",
    compatibility: "unavailable",
  };
}

function unusable(provider: Provider): ProviderStatus {
  return {
    provider,
    installation: "failed",
    version: null,
    authentication: "unknown",
    compatibility: "unavailable",
  };
}

export class ProviderDetector {
  private readonly paths: ConnectorPaths;
  private readonly fileSystem: ManagedFileSystem;
  private readonly processRunner: ProcessRunner;

  constructor(dependencies: ProviderDetectorDependencies) {
    this.paths = dependencies.paths;
    this.fileSystem = dependencies.fileSystem;
    this.processRunner = dependencies.processRunner;
  }

  /** The status of both providers, in contract order, for one status frame. */
  async detectAll(): Promise<ProviderStatus[]> {
    const statuses: ProviderStatus[] = [];
    for (const provider of ProviderSchema.options) {
      statuses.push(await this.detect(provider));
    }
    return statuses;
  }

  /**
   * Reports what Meld's own managed copy of a provider can actually do. Only the
   * binary under `providers/<provider>/current` is consulted — never a `codex`
   * or `claude` resolved from `PATH` — so a globally installed client of the
   * user's own is neither detected nor disturbed.
   */
  async detect(provider: Provider): Promise<ProviderStatus> {
    const requested = ProviderSchema.parse(provider);
    const executable = managedProviderExecutable(
      this.paths.providerCurrent(requested),
      requested,
    );

    if (!(await this.fileSystem.exists(executable))) {
      return notInstalled(requested);
    }

    const pinned = providerRelease(requested).version;
    const reported = await this.reportedVersion(executable, requested);

    if (reported === undefined) {
      return unusable(requested);
    }
    if (!reported.includes(pinned)) {
      return {
        provider: requested,
        installation: "update_required",
        version: SEMVER.exec(reported)?.[1] ?? null,
        authentication: "unknown",
        compatibility: "outdated",
      };
    }

    return {
      provider: requested,
      installation: "installed",
      version: pinned,
      authentication: await this.authentication(executable, requested),
      compatibility: "supported",
    };
  }

  private async reportedVersion(
    executable: string,
    provider: Provider,
  ): Promise<string | undefined> {
    try {
      const result = await this.probe(executable, provider, ["--version"]);
      return result.code === 0 ? result.stdout : undefined;
    } catch {
      // A managed binary that cannot be spawned at all is a failed
      // installation, not a crash of the connector.
      return undefined;
    }
  }

  private async authentication(
    executable: string,
    provider: Provider,
  ): Promise<ProviderStatus["authentication"]> {
    let stdout: string;
    let code: number | null;

    try {
      const result = await this.probe(
        executable,
        provider,
        STATUS_COMMAND[provider],
      );
      stdout = result.stdout;
      code = result.code;
    } catch {
      return "unknown";
    }

    if (code !== 0) {
      return "signed_out";
    }
    if (provider === "codex") {
      return "authenticated";
    }

    // Claude exits 0 either way and prints its verdict as JSON, so the verdict
    // is what decides. Only `loggedIn` is read; the rest of the object, which
    // carries account details, is discarded unparsed.
    let value: unknown;
    try {
      value = JSON.parse(stdout);
    } catch {
      return "unknown";
    }

    const parsed = ClaudeStatusSchema.safeParse(value);
    if (!parsed.success) {
      return "unknown";
    }
    return parsed.data.loggedIn ? "authenticated" : "signed_out";
  }

  private probe(
    executable: string,
    provider: Provider,
    args: readonly string[],
  ) {
    return this.processRunner.run({
      executable,
      args,
      cwd: path.dirname(executable),
      env: managedProviderEnvironment(this.paths, provider),
    });
  }
}
