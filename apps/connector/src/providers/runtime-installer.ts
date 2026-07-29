import path from "node:path";
import type { ManagedFileSystem } from "../config/connector-config";
import type { ConnectorPaths } from "../config/paths";
import type {
  CommandResult,
  CommandRunner,
} from "../launchd/command-runner";
import type { VerifiedArtifact } from "./artifact-downloader";
import {
  RELEASES,
  isSupportedArchitecture,
  nodeArchiveName,
  nodeArtifact,
  type SupportedArchitecture,
} from "./release-manifest";

const TAR = "/usr/bin/tar";

export type RuntimeInstallFailure =
  | "unsupported-platform"
  | "unsupported-architecture"
  | "extraction-failed"
  | "version-mismatch"
  | "activation-failed";

export class RuntimeInstallError extends Error {
  override readonly name = "RuntimeInstallError";
  readonly reason: RuntimeInstallFailure;

  constructor(reason: RuntimeInstallFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

export interface RuntimeArtifactDownloader {
  download(
    artifact: VerifiedArtifact,
    destination: string,
  ): Promise<void>;
}

/**
 * Points the background agent at a verified private Node runtime. Task 4 wires
 * this to the LaunchAgent cutover; it is injected so no test can reach a real
 * `launchctl`.
 */
export interface RuntimeActivator {
  activate(nodePath: string, version: string): Promise<void>;
}

export interface RuntimeInstallerDependencies {
  paths: ConnectorPaths;
  fileSystem: ManagedFileSystem;
  runner: CommandRunner;
  downloader: RuntimeArtifactDownloader;
  activator: RuntimeActivator;
  platform: string;
  arch: string;
}

export interface RuntimeInstallation {
  version: string;
  nodePath: string;
  alreadyInstalled: boolean;
}

function diagnostic(result: CommandResult): string {
  return [result.stdout, result.stderr ?? ""]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join("\n");
}

export class RuntimeInstaller {
  private readonly paths: ConnectorPaths;
  private readonly fileSystem: ManagedFileSystem;
  private readonly runner: CommandRunner;
  private readonly downloader: RuntimeArtifactDownloader;
  private readonly activator: RuntimeActivator;
  private readonly platform: string;
  private readonly arch: string;

  constructor(dependencies: RuntimeInstallerDependencies) {
    this.paths = dependencies.paths;
    this.fileSystem = dependencies.fileSystem;
    this.runner = dependencies.runner;
    this.downloader = dependencies.downloader;
    this.activator = dependencies.activator;
    this.platform = dependencies.platform;
    this.arch = dependencies.arch;
  }

  /**
   * Installs the pinned Node release, if it is not already installed and
   * healthy, and only then activates it. Every failure path leaves the
   * previously active runtime in place: the version directory is assembled in a
   * staging directory and the `current` symlink is swapped by an atomic rename
   * as the last step, and a failed activation restores the previous target.
   */
  async install(): Promise<RuntimeInstallation> {
    const version = RELEASES.node.version;
    const architecture = this.supportedArchitecture();
    const artifact = nodeArtifact(architecture);
    const versionDir = this.paths.runtimeVersion(version);

    const installed = await this.isHealthy(
      path.join(versionDir, "bin", "node"),
      version,
    );

    if (!installed) {
      await this.installVersion(version, architecture, artifact, versionDir);
    }

    const previousTarget = await this.fileSystem.readSymlink(
      this.paths.runtimeCurrent,
    );
    await this.pointCurrentAt(versionDir);

    try {
      await this.activator.activate(this.paths.runtimeNode, version);
    } catch (error) {
      await this.restoreCurrent(previousTarget, versionDir);
      throw new RuntimeInstallError(
        "activation-failed",
        `Activating the private Node runtime failed: ${
          error instanceof Error ? error.message : "unknown activation error"
        }`,
      );
    }

    return {
      version,
      nodePath: this.paths.runtimeNode,
      alreadyInstalled: installed,
    };
  }

  private supportedArchitecture(): SupportedArchitecture {
    if (this.platform !== "darwin") {
      throw new RuntimeInstallError(
        "unsupported-platform",
        "The Meld connector runtime requires macOS 13 or newer.",
      );
    }
    if (!isSupportedArchitecture(this.arch)) {
      throw new RuntimeInstallError(
        "unsupported-architecture",
        `Meld does not support the ${this.arch} architecture. Meld requires an ARM64 or x64 Mac.`,
      );
    }

    return this.arch;
  }

  private async installVersion(
    version: string,
    architecture: SupportedArchitecture,
    artifact: VerifiedArtifact,
    versionDir: string,
  ): Promise<void> {
    const archive = path.join(
      this.paths.downloadsDir,
      nodeArchiveName(architecture),
    );
    const staging = this.paths.runtimeStaging(version);

    // Nothing is extracted until the download has matched its pinned SHA-256.
    await this.downloader.download(artifact, archive);

    try {
      await this.fileSystem.removeTree(staging);
      await this.fileSystem.makeDirectory(staging);
      await this.extract(archive, staging);
      await this.verifyStagedVersion(staging, version);
    } catch (error) {
      await this.fileSystem.removeTree(staging);
      await this.fileSystem.removeTree(archive);
      throw error;
    }

    // Only now, with a verified tree in hand, is the existing (unhealthy)
    // version directory moved aside so the swap can be a single rename.
    const discarded = this.paths.runtimeDiscarded(version);
    const replacing = await this.fileSystem.exists(versionDir);
    if (replacing) {
      await this.fileSystem.removeTree(discarded);
      await this.fileSystem.rename(versionDir, discarded);
    }

    await this.fileSystem.makeDirectory(path.dirname(versionDir));
    await this.fileSystem.rename(staging, versionDir);

    if (replacing) {
      await this.fileSystem.removeTree(discarded);
    }
    await this.fileSystem.removeTree(archive);
  }

  private async extract(archive: string, staging: string): Promise<void> {
    const result = await this.runner.run(TAR, [
      "-xzf",
      archive,
      "-C",
      staging,
      "--strip-components",
      "1",
    ]);

    if (result.code !== 0) {
      const detail = diagnostic(result);
      throw new RuntimeInstallError(
        "extraction-failed",
        `Extracting the private Node runtime failed with code ${result.code}${
          detail.length > 0 ? `: ${detail}` : ""
        }`,
      );
    }
  }

  private async verifyStagedVersion(
    staging: string,
    version: string,
  ): Promise<void> {
    if (
      !(await this.isHealthy(path.join(staging, "bin", "node"), version))
    ) {
      throw new RuntimeInstallError(
        "version-mismatch",
        `The extracted private Node runtime did not report v${version}.`,
      );
    }
  }

  private async isHealthy(
    nodeExecutable: string,
    version: string,
  ): Promise<boolean> {
    if (!(await this.fileSystem.exists(nodeExecutable))) {
      return false;
    }

    const result = await this.runner.run(nodeExecutable, ["--version"]);
    return result.code === 0 && result.stdout.trim() === `v${version}`;
  }

  private async pointCurrentAt(target: string): Promise<void> {
    if (
      (await this.fileSystem.readSymlink(this.paths.runtimeCurrent)) ===
      target
    ) {
      return;
    }

    const temporaryLink = path.join(
      this.paths.runtimeRoot,
      `.current-${process.pid}-${Date.now()}`,
    );
    await this.fileSystem.makeDirectory(this.paths.runtimeRoot);
    await this.fileSystem.removeTree(temporaryLink);
    await this.fileSystem.createSymlink(target, temporaryLink);
    await this.fileSystem.rename(temporaryLink, this.paths.runtimeCurrent);
  }

  private async restoreCurrent(
    previousTarget: string | undefined,
    attemptedTarget: string,
  ): Promise<void> {
    if (
      previousTarget === undefined ||
      previousTarget === attemptedTarget
    ) {
      return;
    }

    try {
      await this.pointCurrentAt(previousTarget);
    } catch {
      // The activation failure is the error worth reporting; a failed restore
      // must not mask it.
    }
  }
}
