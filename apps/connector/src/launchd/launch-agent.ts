import { mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ConnectorPaths } from "../config/paths";
import type { CommandResult, CommandRunner } from "./command-runner";

function escapeXml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function currentUserDomain(): string {
  const uid = process.getuid?.();

  if (uid === undefined) {
    throw new Error("LaunchAgent management requires a numeric user ID");
  }

  return `gui/${uid}`;
}

function serviceTarget(paths: ConnectorPaths): string {
  return `${currentUserDomain()}/${paths.launchLabel}`;
}

function diagnostic(result: CommandResult): string {
  return [result.stdout, result.stderr ?? ""]
    .map((value) => value.trim())
    .filter((value) => value.length > 0)
    .join("\n");
}

function launchctlFailure(action: string, result: CommandResult): Error {
  const detail = diagnostic(result);
  const suffix = detail.length > 0 ? `: ${detail}` : "";

  return new Error(`launchctl ${action} failed with code ${result.code}${suffix}`);
}

function isNotLoaded(result: CommandResult): boolean {
  if (result.code === 0) {
    return false;
  }

  const detail = diagnostic(result);
  // launchctl has two distinct phrasings for "this label is not registered",
  // and the version of macOS decides which one comes back. `bootout` of an
  // absent job exits 3 with "No such process"; `launchctl print` of an absent
  // label on macOS 15/26 exits 113 with 'Could not find service "…" in domain
  // for user gui: <uid>'. Both mean not-loaded, so either is treated as such —
  // otherwise a status or run-state check throws on a machine that has simply
  // never had the agent bootstrapped.
  return (
    detail.includes("No such process") ||
    detail.includes("Could not find service")
  );
}

export function renderLaunchAgent(
  paths: ConnectorPaths,
  nodePath: string,
): string {
  const label = escapeXml(paths.launchLabel);
  const executable = escapeXml(nodePath);
  const agentEntry = escapeXml(paths.agentEntry);
  const logFile = escapeXml(paths.logFile);

  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${label}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${executable}</string>
    <string>${agentEntry}</string>
  </array>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <dict>
    <key>SuccessfulExit</key>
    <false/>
  </dict>
  <key>StandardOutPath</key>
  <string>${logFile}</string>
  <key>StandardErrorPath</key>
  <string>${logFile}</string>
</dict>
</plist>
`;
}

export async function installLaunchAgent(
  paths: ConnectorPaths,
  nodePath: string,
  runner: CommandRunner,
): Promise<void> {
  await Promise.all([
    mkdir(path.dirname(paths.plistFile), { recursive: true }),
    mkdir(path.dirname(paths.logFile), { recursive: true }),
  ]);
  await writeFile(paths.plistFile, renderLaunchAgent(paths, nodePath), {
    encoding: "utf8",
    mode: 0o600,
  });

  const bootoutResult = await runner.run("launchctl", [
    "bootout",
    serviceTarget(paths),
  ]);

  if (bootoutResult.code !== 0 && !isNotLoaded(bootoutResult)) {
    throw launchctlFailure("bootout", bootoutResult);
  }

  const result = await runner.run("launchctl", [
    "bootstrap",
    currentUserDomain(),
    paths.plistFile,
  ]);

  if (result.code !== 0) {
    throw launchctlFailure("bootstrap", result);
  }
}

export async function uninstallLaunchAgent(
  paths: ConnectorPaths,
  runner: CommandRunner,
): Promise<void> {
  const result = await runner.run("launchctl", [
    "bootout",
    serviceTarget(paths),
  ]);

  if (result.code !== 0 && !isNotLoaded(result)) {
    throw launchctlFailure("bootout", result);
  }

  await rm(paths.plistFile, { force: true });
}

async function readPlist(file: string): Promise<string | undefined> {
  try {
    return await readFile(file, "utf8");
  } catch (error) {
    if (
      error instanceof Error &&
      "code" in error &&
      error.code === "ENOENT"
    ) {
      return undefined;
    }
    throw error;
  }
}

async function writePlistAtomically(
  file: string,
  contents: string,
): Promise<void> {
  const temporaryFile = `${file}.${process.pid}.new`;
  await writeFile(temporaryFile, contents, {
    encoding: "utf8",
    mode: 0o600,
  });
  await rename(temporaryFile, file);
}

async function restartAgent(paths: ConnectorPaths, runner: CommandRunner) {
  const bootoutResult = await runner.run("launchctl", [
    "bootout",
    serviceTarget(paths),
  ]);

  if (bootoutResult.code !== 0 && !isNotLoaded(bootoutResult)) {
    throw launchctlFailure("bootout", bootoutResult);
  }

  return runner.run("launchctl", [
    "bootstrap",
    currentUserDomain(),
    paths.plistFile,
  ]);
}

/**
 * Moves the LaunchAgent onto the managed private Node runtime. The plist is
 * only rewritten once `nodePath --version` has reported the expected version,
 * the write itself is atomic, and a failed bootstrap restores and restarts the
 * previous plist so the device is never left with a dead agent.
 */
export async function updateLaunchAgentNodePath(
  paths: ConnectorPaths,
  nodePath: string,
  expectedNodeVersion: string,
  runner: CommandRunner,
): Promise<void> {
  // A dangling `current` symlink, a lost executable bit, or a truncated binary
  // makes `CommandRunner.run` reject instead of resolving, so treat any spawn
  // failure as "this runtime cannot be run" rather than surfacing a raw errno.
  let versionResult: CommandResult;
  try {
    versionResult = await runner.run(nodePath, ["--version"]);
  } catch (error) {
    throw new Error(
      `The private Node runtime could not be run (${
        error instanceof Error ? error.message : "unknown spawn failure"
      }); the LaunchAgent was left unchanged.`,
    );
  }

  const reported = versionResult.stdout.trim();

  if (versionResult.code !== 0) {
    throw new Error(
      `The private Node runtime could not be run (exit code ${versionResult.code}); the LaunchAgent was left unchanged.`,
    );
  }
  if (reported !== `v${expectedNodeVersion}`) {
    throw new Error(
      `The private Node runtime did not report v${expectedNodeVersion}; the LaunchAgent was left unchanged.`,
    );
  }

  const desired = renderLaunchAgent(paths, nodePath);
  const previous = await readPlist(paths.plistFile);

  if (previous === desired && (await isLaunchAgentLoaded(paths, runner))) {
    return;
  }

  await Promise.all([
    mkdir(path.dirname(paths.plistFile), { recursive: true }),
    mkdir(path.dirname(paths.logFile), { recursive: true }),
  ]);
  await writePlistAtomically(paths.plistFile, desired);

  const result = await restartAgent(paths, runner);
  if (result.code === 0) {
    return;
  }

  const failure = launchctlFailure("bootstrap", result);

  if (previous === undefined) {
    await rm(paths.plistFile, { force: true });
    throw failure;
  }

  await writePlistAtomically(paths.plistFile, previous);

  let restoreFailure: Error | undefined;
  try {
    const restored = await restartAgent(paths, runner);
    if (restored.code !== 0) {
      restoreFailure = launchctlFailure("bootstrap", restored);
    }
  } catch (error) {
    restoreFailure =
      error instanceof Error ? error : new Error("unknown rollback error");
  }

  if (restoreFailure) {
    throw new AggregateError(
      [failure, restoreFailure],
      `${failure.message}. Restoring the previous LaunchAgent also failed: ${restoreFailure.message}`,
    );
  }

  throw new Error(
    `${failure.message}. The previous LaunchAgent was restored and restarted.`,
  );
}

export async function isLaunchAgentLoaded(
  paths: ConnectorPaths,
  runner: CommandRunner,
): Promise<boolean> {
  const result = await runner.run("launchctl", [
    "print",
    serviceTarget(paths),
  ]);

  if (result.code === 0) {
    return true;
  }

  if (isNotLoaded(result)) {
    return false;
  }

  throw launchctlFailure("print", result);
}

/**
 * Whether the agent is actually running right now, not merely registered.
 *
 * `launchctl bootstrap` returning 0 only means the job was loaded; a job can be
 * loaded and already exited (a connector that hit "re-pair required" exits 0 and
 * is not relaunched). `launchctl print` distinguishes the two: a live job reports
 * a `pid`, an exited one reports a `last exit code` and no pid.
 */
export type AgentRunState =
  | { status: "running"; pid: number }
  | { status: "stopped"; lastExitCode: number | null }
  | { status: "not-loaded" };

export async function launchAgentRunState(
  paths: ConnectorPaths,
  runner: CommandRunner,
): Promise<AgentRunState> {
  const result = await runner.run("launchctl", [
    "print",
    serviceTarget(paths),
  ]);

  if (isNotLoaded(result)) {
    return { status: "not-loaded" };
  }
  if (result.code !== 0) {
    throw launchctlFailure("print", result);
  }

  const pidMatch = result.stdout.match(/\bpid = (\d+)/);
  if (pidMatch?.[1] !== undefined) {
    return { status: "running", pid: Number(pidMatch[1]) };
  }

  const exitMatch = result.stdout.match(/last exit code = (\d+)/);
  return {
    status: "stopped",
    lastExitCode: exitMatch?.[1] !== undefined ? Number(exitMatch[1]) : null,
  };
}
