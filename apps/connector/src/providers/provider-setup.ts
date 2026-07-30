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
  FORBIDDEN_CHILD_VARIABLES,
  managedProviderEnvironment,
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
 * How long unreadable verdicts are tolerated before Meld starts counting them.
 *
 * An `unknown` verdict means the provider's own status command was consulted but
 * Meld could not tell what it said — a changed output shape, or a probe that
 * could not be spawned. It is *not* proof that the person is signed in, so a run
 * of them cannot be allowed to consume the full ten minutes and then report an
 * untrue "sign-in was not completed". But it is not proof they are signed out
 * either: a client that prints an unparseable verdict *while signed out* would,
 * under a purely count-based bound, have its login window closed a few seconds
 * after it opened — long before anyone could finish a browser flow. So the
 * counting only begins once a realistic login window has elapsed.
 */
export const UNREADABLE_VERDICT_GRACE_MS = 60_000;

/**
 * How many consecutive unreadable verdicts, *after* the grace window, end the
 * wait. Any definite verdict resets the count, so one transient probe failure
 * costs nothing.
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
 * The whole login script. It carries the managed binary and the managed
 * environment and nothing else — no credential, no pairing code, no token — so a
 * reader of the file learns only which client Meld is about to run.
 *
 * `environment` is deliberately not assembled here: it is the very object the
 * `--version` and status probes run under, so the window the person watches and
 * the verification that follows it cannot drift apart. Two concrete failures that
 * separately-written exports would reintroduce:
 *
 * - the provider commands are `#!/usr/bin/env node` shims, so without the private
 *   runtime's `bin` first on `PATH` the login would run under whatever `node` the
 *   user's Terminal happens to have — or none at all — defeating the pinned
 *   runtime for the one step the user actually sits and watches;
 * - the probes run with `HOME` set to the provider home, so a login left on the
 *   real `HOME` could write its credentials somewhere verification never looks:
 *   the login appears to succeed, the status command never flips, and the person
 *   waits out the timeout.
 *
 * Unlike every other provider process, this one is not spawned by Meld with an
 * environment built from `{}` — it runs inside the user's Terminal and so starts
 * from whatever that Terminal exports. Exports alone are only an overlay, so the
 * script first `unset`s every variable on the shared deny-list. Without that, an
 * `OPENAI_API_KEY` in someone's shell profile could authenticate the client by
 * API key instead of the interactive subscription session — looking like success
 * while defeating the point of the login.
 */
export function renderLoginScript(
  provider: Provider,
  executable: string,
  environment: Readonly<Record<string, string>>,
): string {
  const command = [
    shellQuote(executable),
    ...LOGIN_COMMAND[provider],
  ].join(" ");

  // Sorted so the file is byte-stable regardless of how the environment object
  // was built up.
  const exports = Object.keys(environment)
    .sort()
    .map((key) => `export ${key}=${shellQuote(environment[key] ?? "")}`);

  return [
    "#!/bin/sh",
    ...unsetPrologue(),
    ...exports,
    `exec ${command}`,
    "",
  ].join("\n");
}

/**
 * The `unset` lines that neutralise inherited credentials and proxy overrides.
 *
 * The names come from the shared deny-list, sorted for a byte-stable file. Each is
 * checked against a strict shell-identifier pattern first: these are Meld's own
 * constants rather than user input, but an unquotable name would otherwise be
 * pasted straight into a script that runs in the user's Terminal, and `unset` of
 * a variable that was never set is a harmless no-op in `sh`.
 */
function unsetPrologue(): string[] {
  const names = [...FORBIDDEN_CHILD_VARIABLES]
    .filter((name) => /^[A-Za-z_][A-Za-z0-9_]*$/.test(name))
    .sort();

  return names.length > 0 ? [`unset ${names.join(" ")}`] : [];
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
          // The same environment the probes use, from the same accessor.
          managedProviderEnvironment(this.paths, provider),
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
    const started = this.clock.now();
    const deadline = started + LOGIN_TIMEOUT_MS;
    let unreadable = 0;

    for (;;) {
      this.assertNotCancelled(signal);
      const status = await this.detector.detect(provider);

      if (status.authentication === "authenticated") {
        return;
      }

      if (status.authentication !== "unknown") {
        unreadable = 0;
      } else if (
        this.clock.now() - started >= UNREADABLE_VERDICT_GRACE_MS
      ) {
        // Past the grace window an unreadable verdict is no longer plausibly
        // "the person is still in the browser", so a short run of them ends the
        // wait with an honest message instead of a ten-minute untruth.
        unreadable += 1;
        if (unreadable >= MAX_UNREADABLE_VERDICTS) {
          throw new ProviderSetupError(
            "authentication-indeterminate",
            `Meld could not read the ${provider} sign-in verdict from the client's own status command, so it cannot confirm the sign-in.`,
          );
        }
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
