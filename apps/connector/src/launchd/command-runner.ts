import { execFile } from "node:child_process";

export interface CommandResult {
  stdout: string;
  stderr?: string;
  code: number;
}

export interface CommandRunner {
  run(command: string, args: string[]): Promise<CommandResult>;
}

export const nodeCommandRunner: CommandRunner = {
  run(command, args) {
    return new Promise((resolve, reject) => {
      execFile(
        command,
        args,
        { encoding: "utf8" },
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
