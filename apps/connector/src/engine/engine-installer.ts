import { randomUUID } from "node:crypto";
import path from "node:path";
import { z } from "zod";
import type { ManagedFileSystem } from "../config/connector-config";
import type { ConnectorPaths } from "../config/paths";
import type { CommandRunner } from "../launchd/command-runner";
import { redactDiagnostic } from "../providers/provider-installer";
import { RELEASES } from "../providers/release-manifest";

const REGISTRY = "https://registry.npmjs.org/";

export type EngineInstallFailure = "install-failed" | "integrity-mismatch" | "version-mismatch";

export class EngineInstallError extends Error {
  override readonly name = "EngineInstallError";

  constructor(readonly reason: EngineInstallFailure, message: string) {
    super(message);
  }
}

const LockSchema = z.object({
  packages: z.object({
    "node_modules/t3": z.object({
      version: z.string(),
      integrity: z.string(),
      resolved: z.string(),
    }),
  }),
});

interface EngineInstallation {
  version: string;
  executable: string;
  alreadyInstalled: boolean;
}

export function engineLauncherEnvironment(paths: ConnectorPaths): Record<string, string> {
  return {
    HOME: paths.engineHome,
    PATH: `${path.dirname(paths.runtimeNode)}:/usr/bin:/bin`,
    T3CODE_HOME: paths.engineHome,
    T3CODE_TELEMETRY_ENABLED: "false",
    T3CODE_OTEL_SDK_DISABLED: "true",
  };
}

export class EngineInstaller {
  private installing: Promise<EngineInstallation> | undefined;

  constructor(private readonly deps: {
    paths: ConnectorPaths;
    fileSystem: ManagedFileSystem;
    runner: CommandRunner;
  }) {}

  install(): Promise<EngineInstallation> {
    this.installing ??= this.installPinned().finally(() => { this.installing = undefined; });
    return this.installing;
  }

  private async installPinned(): Promise<EngineInstallation> {
    const { paths, fileSystem } = this.deps;
    const { version } = RELEASES.engine;
    const versionDir = paths.engineVersion(version);
    await fileSystem.makeDirectory(paths.engineHome);

    let alreadyInstalled = false;
    if (await fileSystem.exists(versionDir)) {
      try {
        await this.verify(versionDir);
        alreadyInstalled = true;
      } catch {
        // Replace an incomplete or invalid installation after verifying the new one.
      }
    }

    if (!alreadyInstalled) {
      const staging = `${versionDir}.staging-${randomUUID()}`;
      try {
        await this.npmInstall(staging);
        await this.verify(staging);
        await fileSystem.removeTree(versionDir);
        await fileSystem.rename(staging, versionDir);
      } finally {
        await fileSystem.removeTree(staging).catch(() => {});
      }
    }

    await this.pointCurrentAt(versionDir);
    return { version, executable: paths.engineExecutable, alreadyInstalled };
  }

  private async npmInstall(directory: string): Promise<void> {
    const { paths, fileSystem, runner } = this.deps;
    const { package: packageName, version } = RELEASES.engine;
    const cache = path.join(paths.root, "cache", "npm");
    await fileSystem.makeDirectory(directory);
    await fileSystem.makeDirectory(cache);
    const result = await runner.run(
      paths.runtimeNpm,
      ["install", "--prefix", directory, "--save-exact", "--ignore-scripts", `${packageName}@${version}`],
      {
        cwd: directory,
        env: {
          ...engineLauncherEnvironment(paths),
          npm_config_cache: cache,
          npm_config_registry: REGISTRY,
          npm_config_userconfig: path.join(paths.engineHome, ".npmrc"),
          npm_config_globalconfig: path.join(paths.engineHome, "global-npmrc"),
          npm_config_audit: "false",
          npm_config_fund: "false",
          npm_config_update_notifier: "false",
        },
      },
    ).catch(() => {
      throw new EngineInstallError("install-failed", "Could not run npm to install the build engine.");
    });
    if (result.code !== 0) {
      const diagnostic = redactDiagnostic(`${result.stderr ?? ""}\n${result.stdout}`.trim()).slice(-300);
      throw new EngineInstallError("install-failed", `Installing the build engine failed with exit code ${result.code}${diagnostic ? `: ${diagnostic}` : ""}`);
    }
  }

  private async verify(directory: string): Promise<void> {
    const { paths, fileSystem, runner } = this.deps;
    const { package: packageName, version, integrity } = RELEASES.engine;
    const raw = await fileSystem.readText(path.join(directory, "package-lock.json")).catch(() => "");
    let entry: z.infer<typeof LockSchema>["packages"]["node_modules/t3"] | undefined;
    try {
      entry = LockSchema.parse(JSON.parse(raw)).packages["node_modules/t3"];
    } catch {
      // Missing and malformed metadata are both unverified.
    }
    if (entry?.version !== version || entry.integrity !== integrity
      || entry.resolved !== `${REGISTRY}${packageName}/-/${packageName}-${version}.tgz`) {
      throw new EngineInstallError("integrity-mismatch", "The downloaded build engine is not the reviewed release.");
    }
    const launcher = path.join(directory, "node_modules", packageName, "bin", "t3.mjs");
    const result = await runner.run(paths.runtimeNode, [launcher, "--version"], {
      env: engineLauncherEnvironment(paths),
    }).catch(() => {
      throw new EngineInstallError("version-mismatch", "Could not verify the build engine version.");
    });
    if (result.code !== 0 || result.stdout.trim() !== `t3 v${version}`) {
      throw new EngineInstallError("version-mismatch", "The build engine reports an unexpected version.");
    }
  }

  private async pointCurrentAt(versionDir: string): Promise<void> {
    const { paths, fileSystem } = this.deps;
    if ((await fileSystem.readSymlink(paths.engineCurrent)) === versionDir) return;
    const staging = `${paths.engineCurrent}.next-${randomUUID()}`;
    try {
      await fileSystem.createSymlink(versionDir, staging);
      await fileSystem.rename(staging, paths.engineCurrent);
    } finally {
      await fileSystem.removeTree(staging).catch(() => {});
    }
  }
}
