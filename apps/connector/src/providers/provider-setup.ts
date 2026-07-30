import { chmod, mkdir, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  ProviderSchema,
  type Provider,
  type ProviderSetupErrorCode,
  type ProviderSetupStage,
  type ProviderStatus,
} from "@meld/contracts";
import type { ManagedFileSystem } from "../config/connector-config";
import type { ConnectorPaths } from "../config/paths";
import type { CommandRunner } from "../launchd/command-runner";
import { updateLaunchAgentNodePath } from "../launchd/launch-agent";
import {
  PROVIDER_CONFIG_VARIABLE,
  type ProviderInstallation,
} from "./provider-installer";
import type { RuntimeActivator } from "./runtime-installer";

/** macOS's own "open this file with that application" front end. */
const OPEN = "/usr/bin/open";

/** How often the provider's own status command is asked for its verdict. */
export const LOGIN_POLL_INTERVAL_MS = 2_000;

/** How long a person gets to finish the official browser login. */
export const LOGIN_TIMEOUT_MS = 10 * 60 * 1_000;

/**
 * How many consecutive unreadable verdicts are tolerated before the wait is
 * abandoned. An `unknown` verdict means the provider's own status command was
 * consulted but Meld could not tell what it said — a changed output shape, or a
 * probe that could not be spawned. Waiting the full ten minutes on those would
 * end in an untrue "sign-in was not completed" message, so a short run of them
 * fails fast and says what actually happened instead. Any definite verdict
 * resets the count, so one transient probe failure costs nothing.
 */
export const MAX_UNREADABLE_VERDICTS = 3;

/** The subcommand each official client uses for its own login flow. */
const LOGIN_COMMAND: Record<Provider, readonly string[]> = {
  codex: ["login"],
  claude: ["auth", "login"],
};

export type ProviderSetupFailure =
  | "unsupported-platform"
  | "runtime-install-failed"
  | "provider-install-failed"
  | "authentication-failed"
  | "authentication-timed-out"
  | "authentication-indeterminate"
  | "verification-failed"
  | "cancelled";

const FAILURE_CODES: Record<ProviderSetupFailure, ProviderSetupErrorCode> = {
  "unsupported-platform": "unsupported_platform",
  "runtime-install-failed": "runtime_install_failed",
  "provider-install-failed": "provider_install_failed",
  "authentication-failed": "authentication_failed",
  "authentication-timed-out": "authentication_failed",
  "authentication-indeterminate": "authentication_failed",
  "verification-failed": "verification_failed",
  cancelled: "cancelled",
};

export class ProviderSetupError extends Error {
  override readonly name = "ProviderSetupError";
  readonly reason: ProviderSetupFailure;
  /** The wire code the gateway settles the setup request with. */
  readonly code: ProviderSetupErrorCode;

  constructor(reason: ProviderSetupFailure, message: string) {
    super(message);
    this.reason = reason;
    this.code = FAILURE_CODES[reason];
  }
}

/**
 * Writes and deletes the visible login command. It is a separate injected seam
 * so no test can drop a mode-`0700` executable script into a real Meld
 * directory, and so the executable bit is asserted directly.
 */
export interface LoginScriptWriter {
  write(file: string, contents: string, mode: number): Promise<void>;
  remove(file: string): Promise<void>;
}

export const nodeLoginScriptWriter: LoginScriptWriter = {
  async write(file, contents, mode) {
    await mkdir(path.dirname(file), { recursive: true });
    await writeFile(file, contents, { encoding: "utf8", mode });
    // `writeFile` only applies the mode when it creates the file, so re-assert
    // it in case a script from an earlier attempt is still there.
    await chmod(file, mode);
  },
  async remove(file) {
    await rm(file, { force: true });
  },
};

export interface SetupClock {
  now(): number;
  sleep(milliseconds: number): Promise<void>;
}

export const nodeSetupClock: SetupClock = {
  now: () => Date.now(),
  sleep: (milliseconds) =>
    new Promise((resolve) => {
      setTimeout(resolve, milliseconds);
    }),
};

export interface RuntimeInstallerLike {
  install(): Promise<{ version: string; nodePath: string }>;
}

export interface ProviderInstallerLike {
  install(provider: Provider): Promise<ProviderInstallation>;
}

export interface ProviderDetectorLike {
  detect(provider: Provider): Promise<ProviderStatus>;
}

export interface ProviderSetupDependencies {
  paths: ConnectorPaths;
  fileSystem: ManagedFileSystem;
  /** Runs `/usr/bin/open`; provider binaries go through the process runner. */
  runner: CommandRunner;
  runtimeInstaller: RuntimeInstallerLike;
  providerInstaller: ProviderInstallerLike;
  detector: ProviderDetectorLike;
  scriptWriter: LoginScriptWriter;
  clock: SetupClock;
  platform: string;
}

export type ProviderSetupProgress = (
  stage: ProviderSetupStage,
) => void | Promise<void>;

/** Quotes one absolute path as a single shell word, apostrophes included. */
function shellQuote(value: string): string {
  return `'${value.replaceAll("'", String.raw`'\''`)}'`;
}

/**
 * The whole login script. It carries the managed binary and the isolated config
 * directory and nothing else — no credential, no pairing code, no token — so a
 * reader of the file learns only which client Meld is about to run.
 */
export function renderLoginScript(
  provider: Provider,
  executable: string,
  configDirectory: string,
): string {
  const command = [
    shellQuote(executable),
    ...LOGIN_COMMAND[provider],
  ].join(" ");

  return [
    "#!/bin/sh",
    `export ${PROVIDER_CONFIG_VARIABLE[provider]}=${shellQuote(
      configDirectory,
    )}`,
    `exec ${command}`,
    "",
  ].join("\n");
}

/**
 * Binds the runtime installation to the LaunchAgent cutover. Composing the two
 * here is what makes "move the agent onto the private runtime only after
 * `node --version` reports the pinned version" a single testable production
 * path rather than a property of two independently tested halves.
 */
export function launchAgentRuntimeActivator(
  paths: ConnectorPaths,
  runner: CommandRunner,
): RuntimeActivator {
  return {
    activate: (nodePath, version) =>
      updateLaunchAgentNodePath(paths, nodePath, version, runner),
  };
}

export class ProviderSetup {
  private readonly paths: ConnectorPaths;
  private readonly fileSystem: ManagedFileSystem;
  private readonly runner: CommandRunner;
  private readonly runtimeInstaller: RuntimeInstallerLike;
  private readonly providerInstaller: ProviderInstallerLike;
  private readonly detector: ProviderDetectorLike;
  private readonly scriptWriter: LoginScriptWriter;
  private readonly clock: SetupClock;
  private readonly platform: string;

  constructor(dependencies: ProviderSetupDependencies) {
    this.paths = dependencies.paths;
    this.fileSystem = dependencies.fileSystem;
    this.runner = dependencies.runner;
    this.runtimeInstaller = dependencies.runtimeInstaller;
    this.providerInstaller = dependencies.providerInstaller;
    this.detector = dependencies.detector;
    this.scriptWriter = dependencies.scriptWriter;
    this.clock = dependencies.clock;
    this.platform = dependencies.platform;
  }

  /**
   * Installs, authenticates, and verifies one managed provider, reporting
   * `installing` → `authenticating` → `verifying` in that order. Authentication
   * is always the provider's own official login flow, run visibly, and the only
   * evidence Meld accepts is the provider's own status command.
   */
  async connect(
    provider: Provider,
    onProgress: ProviderSetupProgress,
    signal?: AbortSignal,
  ): Promise<ProviderStatus> {
    const requested = ProviderSchema.parse(provider);

    if (this.platform !== "darwin") {
      throw new ProviderSetupError(
        "unsupported-platform",
        "Connecting a managed AI provider requires macOS 13 or newer.",
      );
    }
    this.assertNotCancelled(signal);

    const installation = await this.install(requested, onProgress);

    await onProgress("authenticating");
    this.assertNotCancelled(signal);
    await this.authenticate(requested, installation.executable, signal);

    await onProgress("verifying");
    this.assertNotCancelled(signal);
    return this.verify(requested);
  }

  private async install(
    provider: Provider,
    onProgress: ProviderSetupProgress,
  ): Promise<ProviderInstallation> {
    await onProgress("installing");

    try {
      await this.runtimeInstaller.install();
    } catch (error) {
      throw new ProviderSetupError(
        "runtime-install-failed",
        `Installing Meld's private Node runtime failed: ${describe(error)}`,
      );
    }

    try {
      return await this.providerInstaller.install(provider);
    } catch (error) {
      throw new ProviderSetupError(
        "provider-install-failed",
        `Installing the managed ${provider} client failed: ${describe(error)}`,
      );
    }
  }

  /**
   * Drives the provider's own login flow in a visible Terminal window and then
   * waits for the provider's own status command to say it worked. The script is
   * deleted however this ends.
   */
  private async authenticate(
    provider: Provider,
    executable: string,
    signal?: AbortSignal,
  ): Promise<void> {
    // A provider that is already signed in needs no visible login at all, so
    // nothing is written to disk and no Terminal window is opened.
    const existing = await this.detector.detect(provider);
    if (existing.authentication === "authenticated") {
      return;
    }

    const script = this.paths.providerLoginCommand;

    try {
      await this.fileSystem.makeDirectory(this.paths.stateDir);
      await this.scriptWriter.write(
        script,
        renderLoginScript(
          provider,
          executable,
          this.paths.providerHome(provider),
        ),
        0o700,
      );
    } catch {
      await this.deleteScript(script);
      throw new ProviderSetupError(
        "authentication-failed",
        `Preparing the visible ${provider} login could not be completed.`,
      );
    }

    try {
      await this.openLoginWindow(provider, script);
      await this.waitForAuthentication(provider, signal);
    } finally {
      await this.deleteScript(script);
    }
  }

  private async openLoginWindow(
    provider: Provider,
    script: string,
  ): Promise<void> {
    let code: number;
    try {
      ({ code } = await this.runner.run(OPEN, ["-a", "Terminal", script]));
    } catch {
      throw new ProviderSetupError(
        "authentication-failed",
        `Opening the ${provider} login window could not be started.`,
      );
    }

    if (code !== 0) {
      // `open`'s own output can echo the path it was handed, so only the exit
      // code is reported.
      throw new ProviderSetupError(
        "authentication-failed",
        `Opening the ${provider} login window failed with exit code ${code}.`,
      );
    }
  }

  private async waitForAuthentication(
    provider: Provider,
    signal?: AbortSignal,
  ): Promise<void> {
    const deadline = this.clock.now() + LOGIN_TIMEOUT_MS;
    let unreadable = 0;

    for (;;) {
      this.assertNotCancelled(signal);
      const status = await this.detector.detect(provider);

      if (status.authentication === "authenticated") {
        return;
      }

      if (status.authentication === "unknown") {
        unreadable += 1;
        if (unreadable >= MAX_UNREADABLE_VERDICTS) {
          throw new ProviderSetupError(
            "authentication-indeterminate",
            `Meld could not read the ${provider} sign-in verdict from the client's own status command, so it cannot confirm the sign-in.`,
          );
        }
      } else {
        unreadable = 0;
      }

      if (this.clock.now() + LOGIN_POLL_INTERVAL_MS >= deadline) {
        throw new ProviderSetupError(
          "authentication-timed-out",
          `The ${provider} sign-in was not completed within ten minutes.`,
        );
      }

      await this.clock.sleep(LOGIN_POLL_INTERVAL_MS);
    }
  }

  private async verify(provider: Provider): Promise<ProviderStatus> {
    const status = await this.detector.detect(provider);

    if (
      status.installation !== "installed" ||
      status.authentication !== "authenticated" ||
      status.compatibility !== "supported"
    ) {
      throw new ProviderSetupError(
        "verification-failed",
        `The managed ${provider} client did not verify as installed, authenticated, and supported.`,
      );
    }

    return status;
  }

  private assertNotCancelled(signal?: AbortSignal): void {
    if (signal?.aborted) {
      throw new ProviderSetupError(
        "cancelled",
        "The provider setup was cancelled.",
      );
    }
  }

  private async deleteScript(script: string): Promise<void> {
    try {
      await this.scriptWriter.remove(script);
    } catch {
      // A leftover script carries no secret; the original failure is what
      // matters and must not be masked.
    }
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : "unknown failure";
}
