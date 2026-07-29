import { mkdir, rm, writeFile } from "node:fs/promises";
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
  return (
    result.code === 3 &&
    diagnostic(result).includes("No such process")
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
  <true/>
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
