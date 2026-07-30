import path from "node:path";
import { ProviderSchema, type Provider } from "@meld/contracts";
import { z } from "zod";
import type { ManagedFileSystem } from "../config/connector-config";
import type { ConnectorPaths } from "../config/paths";
import type { CommandRunner } from "../launchd/command-runner";
import type { ProcessRunner } from "./process-runner";
import { providerRelease } from "./release-manifest";

/** The npm registry the pinned integrity hashes were taken from. */
const REGISTRY = "https://registry.npmjs.org/";

/** The command name each provider's npm package installs. */
export const PROVIDER_BINARY: Record<Provider, string> = {
  codex: "codex",
  claude: "claude",
};

/**
 * The environment variable each official client reads for its own isolated
 * configuration directory. Meld points them at its private tree so a managed
 * login can never touch the user's own `~/.codex` or `~/.claude`.
 */
export const PROVIDER_CONFIG_VARIABLE: Record<Provider, string> = {
  codex: "CODEX_HOME",
  claude: "CLAUDE_CONFIG_DIR",
};

export type ProviderInstallFailure =
  | "unsupported-platform"
  | "unmanaged-prefix"
  | "install-failed"
  | "lock-mismatch"
  | "missing-executable"
  | "version-mismatch"
  | "activation-failed";

export class ProviderInstallError extends Error {
  override readonly name = "ProviderInstallError";
  readonly reason: ProviderInstallFailure;

  constructor(reason: ProviderInstallFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface ProviderInstallerDependencies {
  paths: ConnectorPaths;
  fileSystem: ManagedFileSystem;
  /** Runs the private runtime's npm; never a package manager from `PATH`. */
  runner: CommandRunner;
  /** Runs the managed provider binary itself, through the one choke point. */
  processRunner: ProcessRunner;
  platform: string;
}

export interface ProviderInstallation {
  provider: Provider;
  version: string;
  executable: string;
  alreadyInstalled: boolean;
}

const LockEntrySchema = z.object({
  version: z.string().optional(),
  resolved: z.string().optional(),
  integrity: z.string().optional(),
});

const LockSchema = z.object({
  packages: z.record(z.string(), LockEntrySchema),
});

/** Where the managed npm prefix puts the provider's command. */
export function managedProviderExecutable(
  root: string,
  provider: Provider,
): string {
  return path.join(root, "node_modules", ".bin", PROVIDER_BINARY[provider]);
}

/** The Meld-owned npm cache; never the user's `~/.npm`. */
function npmCacheDir(paths: ConnectorPaths): string {
  return path.join(paths.root, "cache", "npm");
}

/**
 * Builds a managed environment from `{}` rather than filtering
 * `process.env`, so nothing inherited — no API key, no proxy, no npm registry
 * override — can reach a provider process or the private npm.
 */
export function managedProviderEnvironment(
  paths: ConnectorPaths,
  provider: Provider,
): Record<string, string> {
  const home = paths.providerHome(provider);
  return {
    PATH: `${path.dirname(paths.runtimeNode)}:/usr/bin:/bin`,
    HOME: home,
    [PROVIDER_CONFIG_VARIABLE[provider]]: home,
  };
}

function isInside(parent: string, child: string): boolean {
  const relative = path.relative(parent, child);
  return (
    relative.length > 0 &&
    !relative.startsWith("..") &&
    !path.isAbsolute(relative)
  );
}

export class ProviderInstaller {
  private readonly paths: ConnectorPaths;
  private readonly fileSystem: ManagedFileSystem;
  private readonly runner: CommandRunner;
  private readonly processRunner: ProcessRunner;
  private readonly platform: string;

  constructor(dependencies: ProviderInstallerDependencies) {
    this.paths = dependencies.paths;
    this.fileSystem = dependencies.fileSystem;
    this.runner = dependencies.runner;
    this.processRunner = dependencies.processRunner;
    this.platform = dependencies.platform;
  }

  /**
   * Installs the pinned provider release into its own version directory with the
   * private runtime's npm and a Meld-owned cache, verifies the lockfile against
   * the pinned integrity hash and the binary against the pinned version, and
   * only then swaps the `current` symlink by an atomic rename. Every failure
   * path leaves `current` — and therefore the previously working version —
   * exactly where it was.
   */
  async install(provider: Provider): Promise<ProviderInstallation> {
    const requested = ProviderSchema.parse(provider);

    if (this.platform !== "darwin") {
      throw new ProviderInstallError(
        "unsupported-platform",
        "Managed AI providers require macOS 13 or newer.",
      );
    }

    const release = providerRelease(requested);
    const versionDir = this.assertManagedPrefix(requested, release.version);
    const executable = managedProviderExecutable(versionDir, requested);

    // The provider's isolated config directory doubles as its `HOME`, so it has
    // to exist before the client is ever run.
    await this.fileSystem.makeDirectory(this.paths.providerHome(requested));

    if (
      await this.isHealthy(executable, requested, release.version, versionDir)
    ) {
      await this.pointCurrentAt(requested, versionDir);
      return {
        provider: requested,
        version: release.version,
        executable,
        alreadyInstalled: true,
      };
    }

    const active =
      (await this.fileSystem.readSymlink(
        this.paths.providerCurrent(requested),
      )) === versionDir;

    if (!active && (await this.fileSystem.exists(versionDir))) {
      // A half-written tree from an earlier attempt is not what `current`
      // points at, so it can be cleared before this attempt reuses the slot.
      await this.fileSystem.removeTree(versionDir);
    }

    try {
      await this.runNpmInstall(requested, versionDir, release.version);
      await this.verifyLock(requested, versionDir);
      await this.verifyExecutable(requested, versionDir, executable);
    } catch (error) {
      if (!active) {
        await this.discard(versionDir);
      }
      throw error;
    }

    await this.pointCurrentAt(requested, versionDir);

    return {
      provider: requested,
      version: release.version,
      executable,
      alreadyInstalled: false,
    };
  }

  /**
   * The npm prefix must be inside Meld's own providers tree. This is what makes
   * a global prefix (`/usr/local`), a traversal, or any other unmanaged
   * destination a hard refusal rather than an install.
   */
  private assertManagedPrefix(provider: Provider, version: string): string {
    const versionDir = path.resolve(
      this.paths.providerVersion(provider, version),
    );

    if (
      !isInside(path.resolve(this.paths.providersRoot), versionDir) ||
      !isInside(versionDir, managedProviderExecutable(versionDir, provider))
    ) {
      throw new ProviderInstallError(
        "unmanaged-prefix",
        "Refusing to install a managed provider outside Meld's private providers directory.",
      );
    }

    return versionDir;
  }

  private async runNpmInstall(
    provider: Provider,
    versionDir: string,
    version: string,
  ): Promise<void> {
    const release = providerRelease(provider);
    const cache = npmCacheDir(this.paths);
    await this.fileSystem.makeDirectory(versionDir);
    await this.fileSystem.makeDirectory(cache);

    const result = await this.runner.run(
      this.paths.runtimeNpm,
      [
        "install",
        "--prefix",
        versionDir,
        "--save-exact",
        "--ignore-scripts=false",
        `${release.package}@${version}`,
      ],
      {
        cwd: versionDir,
        env: {
          ...managedProviderEnvironment(this.paths, provider),
          npm_config_cache: cache,
          npm_config_registry: REGISTRY,
          npm_config_userconfig: path.join(this.paths.root, "cache", "npmrc"),
          npm_config_globalconfig: path.join(
            this.paths.root,
            "cache",
            "npmrc",
          ),
          npm_config_audit: "false",
          npm_config_fund: "false",
          npm_config_update_notifier: "false",
        },
      },
    );

    if (result.code !== 0) {
      // npm's own output is never embedded: it can echo registry headers and
      // user configuration, and none of that belongs in a Meld error.
      throw new ProviderInstallError(
        "install-failed",
        `Installing the managed ${provider} client failed with exit code ${result.code}.`,
      );
    }
  }

  /**
   * The lockfile npm just wrote must name exactly the pinned version, the
   * pinned npm integrity hash, and the public registry. Anything else means the
   * bytes on disk are not the release Meld reviewed.
   */
  private async verifyLock(
    provider: Provider,
    versionDir: string,
  ): Promise<void> {
    const release = providerRelease(provider);
    const lockFile = path.join(versionDir, "package-lock.json");

    let parsed: z.infer<typeof LockSchema>;
    try {
      const value: unknown = JSON.parse(
        await this.fileSystem.readText(lockFile),
      );
      parsed = LockSchema.parse(value);
    } catch {
      throw new ProviderInstallError(
        "lock-mismatch",
        `The managed ${provider} installation produced no readable package-lock.json.`,
      );
    }

    const entry = parsed.packages[`node_modules/${release.package}`];

    if (
      entry?.version !== release.version ||
      entry.integrity !== release.integrity ||
      !entry.resolved?.startsWith(REGISTRY)
    ) {
      throw new ProviderInstallError(
        "lock-mismatch",
        `The managed ${provider} lockfile does not match the pinned release.`,
      );
    }
  }

  private async verifyExecutable(
    provider: Provider,
    versionDir: string,
    executable: string,
  ): Promise<void> {
    if (
      !isInside(versionDir, executable) ||
      !(await this.fileSystem.exists(executable))
    ) {
      throw new ProviderInstallError(
        "missing-executable",
        `The managed ${provider} installation left no executable in its version directory.`,
      );
    }

    const release = providerRelease(provider);
    if (
      !(await this.reportsVersion(
        executable,
        provider,
        release.version,
        versionDir,
      ))
    ) {
      throw new ProviderInstallError(
        "version-mismatch",
        `The managed ${provider} client did not report version ${release.version}.`,
      );
    }
  }

  /**
   * Runs `<managed binary> --version` and looks for the pinned version inside
   * the banner (`codex-cli 0.146.0`, `2.1.220 (Claude Code)`). A process that
   * cannot be spawned at all — a missing, non-executable, or truncated
   * binary — is simply "not this version", never a raw errno.
   */
  private async reportsVersion(
    executable: string,
    provider: Provider,
    version: string,
    cwd: string,
  ): Promise<boolean> {
    try {
      const result = await this.processRunner.run({
        executable,
        args: ["--version"],
        cwd,
        env: managedProviderEnvironment(this.paths, provider),
      });
      return result.code === 0 && result.stdout.includes(version);
    } catch {
      return false;
    }
  }

  private async isHealthy(
    executable: string,
    provider: Provider,
    version: string,
    versionDir: string,
  ): Promise<boolean> {
    if (!(await this.fileSystem.exists(executable))) {
      return false;
    }
    return this.reportsVersion(executable, provider, version, versionDir);
  }

  private async discard(target: string): Promise<void> {
    try {
      await this.fileSystem.removeTree(target);
    } catch {
      // Best-effort cleanup must not mask the failure that triggered it.
    }
  }

  private async pointCurrentAt(
    provider: Provider,
    target: string,
  ): Promise<void> {
    const current = this.paths.providerCurrent(provider);
    if ((await this.fileSystem.readSymlink(current)) === target) {
      return;
    }

    const temporaryLink = path.join(
      path.dirname(current),
      `.current-${process.pid}-${Date.now()}`,
    );

    try {
      await this.fileSystem.makeDirectory(path.dirname(current));
      await this.fileSystem.removeTree(temporaryLink);
      await this.fileSystem.createSymlink(target, temporaryLink);
      await this.fileSystem.rename(temporaryLink, current);
    } catch (error) {
      await this.discard(temporaryLink);
      throw new ProviderInstallError(
        "activation-failed",
        `Activating the managed ${provider} client failed: ${
          error instanceof Error ? error.message : "unknown activation error"
        }`,
      );
    }
  }
}
