import { execFile } from "node:child_process";

/** Bounds the output Meld will buffer from a managed helper command. */
export const MAX_COMMAND_OUTPUT_BYTES = 1024 * 1024;

export interface CommandResult {
  stdout: string;
  stderr?: string;
  code: number;
}

/**
 * `env` replaces the child environment rather than extending the parent's, so a
 * caller that needs an isolated managed environment builds it from `{}` and
 * nothing inherited can reach the child. Omitting it inherits, which is what
 * `launchctl` and `security` want.
 */
export interface CommandOptions {
  cwd?: string;
  env?: Readonly<Record<string, string>>;
}

export interface CommandRunner {
  run(
    command: string,
    args: string[],
    options?: CommandOptions,
  ): Promise<CommandResult>;
}

export const nodeCommandRunner: CommandRunner = {
  run(command, args, options) {
    return new Promise((resolve, reject) => {
      execFile(
        command,
        args,
        {
          encoding: "utf8",
          maxBuffer: MAX_COMMAND_OUTPUT_BYTES,
          shell: false,
          ...(options?.cwd === undefined ? {} : { cwd: options.cwd }),
          ...(options?.env === undefined ? {} : { env: { ...options.env } }),
        },
        (error, stdout, stderr) => {
          if (!error) {
            resolve({ stdout, stderr, code: 0 });
            return;
          }

          if (typeof error.code === "number") {
            resolve({ stdout, stderr, code: error.code });
            return;
          }

          reject(error);
        },
      );
    });
  },
};
