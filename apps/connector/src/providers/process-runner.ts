import { spawn } from "node:child_process";
import path from "node:path";

/**
 * Per-stream cap on what Meld will hold in memory from a provider child.
 * Provider output is untrusted and can stream indefinitely, so each stream is
 * bounded independently and the excess is dropped rather than buffered.
 */
export const MAX_PROCESS_OUTPUT_BYTES = 1024 * 1024;

/** How long a process group gets to honour `SIGTERM` before it is killed. */
export const PROCESS_TERMINATION_GRACE_MS = 5_000;

export type ProcessRunFailure =
  | "relative-executable"
  | "aborted"
  | "spawn-failed";

export class ProcessRunError extends Error {
  override readonly name = "ProcessRunError";
  readonly reason: ProcessRunFailure;

  constructor(reason: ProcessRunFailure, message: string) {
    super(message);
    this.reason = reason;
  }
}

export type ProcessInvocation = {
  executable: string;
  args: readonly string[];
  cwd: string;
  env: Readonly<Record<string, string>>;
  signal?: AbortSignal;
  stdin?: string;
};

export interface ProcessResult {
  stdout: string;
  stderr: string;
  code: number | null;
  signal: NodeJS.Signals | null;
  aborted: boolean;
  stdoutTruncated: boolean;
  stderrTruncated: boolean;
}

export interface ProcessRunner {
  run(invocation: ProcessInvocation): Promise<ProcessResult>;
}

export interface ProcessRunnerOptions {
  maxOutputBytes?: number;
  killGraceMs?: number;
}

/** A single stream's bounded buffer: it stops growing instead of stopping the child. */
function boundedBuffer(limit: number) {
  const chunks: Buffer[] = [];
  let size = 0;
  let truncated = false;

  return {
    append(chunk: Buffer): void {
      const remaining = limit - size;
      if (remaining <= 0) {
        truncated = chunk.length > 0 || truncated;
        return;
      }
      if (chunk.length > remaining) {
        chunks.push(chunk.subarray(0, remaining));
        size = limit;
        truncated = true;
        return;
      }
      chunks.push(chunk);
      size += chunk.length;
    },
    text(): string {
      return Buffer.concat(chunks).toString("utf8");
    },
    get truncated(): boolean {
      return truncated;
    },
  };
}

/**
 * The single choke point for every managed provider process. Nothing here goes
 * through a shell: the executable must be an absolute managed path and the
 * arguments are passed as an array, so no room content or path can ever be
 * re-parsed as a command. Children are spawned `detached` so each one leads its
 * own process group, which lets cancellation reach a provider's grandchildren
 * instead of orphaning them.
 */
export function createProcessRunner(
  options: ProcessRunnerOptions = {},
): ProcessRunner {
  const maxOutputBytes = options.maxOutputBytes ?? MAX_PROCESS_OUTPUT_BYTES;
  const killGraceMs = options.killGraceMs ?? PROCESS_TERMINATION_GRACE_MS;

  return {
    run(invocation) {
      if (!path.isAbsolute(invocation.executable)) {
        return Promise.reject(
          new ProcessRunError(
            "relative-executable",
            "Refusing to run a provider executable that is not an absolute managed path.",
          ),
        );
      }
      if (invocation.signal?.aborted) {
        return Promise.reject(
          new ProcessRunError(
            "aborted",
            "The provider process was cancelled before it started.",
          ),
        );
      }

      return new Promise<ProcessResult>((resolve, reject) => {
        const stdout = boundedBuffer(maxOutputBytes);
        const stderr = boundedBuffer(maxOutputBytes);
        let aborted = false;
        let settled = false;
        let killTimer: NodeJS.Timeout | undefined;

        const child = spawn(invocation.executable, [...invocation.args], {
          shell: false,
          detached: true,
          cwd: invocation.cwd,
          env: { ...invocation.env },
          stdio: ["pipe", "pipe", "pipe"],
        });

        /**
         * Signals the child's whole process group. The negated pid is the group
         * `detached` created, so a provider that spawned helpers of its own goes
         * down with it rather than leaking a running child.
         */
        function signalGroup(signal: NodeJS.Signals): void {
          const { pid } = child;
          if (pid === undefined) {
            return;
          }
          try {
            process.kill(-pid, signal);
          } catch {
            // The group is already gone, which is the outcome we wanted.
          }
        }

        function terminate(): void {
          if (settled || aborted) {
            return;
          }
          aborted = true;
          signalGroup("SIGTERM");
          killTimer = setTimeout(() => {
            signalGroup("SIGKILL");
          }, killGraceMs);
          killTimer.unref();
        }

        function cleanup(): void {
          settled = true;
          if (killTimer) {
            clearTimeout(killTimer);
          }
          invocation.signal?.removeEventListener("abort", terminate);
        }

        invocation.signal?.addEventListener("abort", terminate, {
          once: true,
        });

        child.stdout?.on("data", (chunk: Buffer) => {
          stdout.append(chunk);
        });
        child.stderr?.on("data", (chunk: Buffer) => {
          stderr.append(chunk);
        });

        child.on("error", (error) => {
          if (settled) {
            return;
          }
          cleanup();
          reject(
            new ProcessRunError(
              "spawn-failed",
              `The managed provider process could not be started: ${error.message}`,
            ),
          );
        });

        child.on("close", (code, signal) => {
          if (settled) {
            return;
          }
          cleanup();
          resolve({
            stdout: stdout.text(),
            stderr: stderr.text(),
            code,
            signal,
            aborted,
            stdoutTruncated: stdout.truncated,
            stderrTruncated: stderr.truncated,
          });
        });

        // Provider clients block waiting on stdin unless it is closed, so it is
        // always ended — immediately when there is nothing to send.
        const input = child.stdin;
        if (input) {
          input.on("error", () => {
            // A child that exits before reading its input is not an error here;
            // its exit code and output are the result that matters.
          });
          if (invocation.stdin !== undefined) {
            input.end(invocation.stdin);
          } else {
            input.end();
          }
        }
      });
    },
  };
}

export const nodeProcessRunner: ProcessRunner = createProcessRunner();
