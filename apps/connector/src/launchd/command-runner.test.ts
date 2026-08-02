import { mkdtemp, realpath, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { nodeCommandRunner } from "./command-runner";

describe("node command runner", () => {
  it("returns stdout and the zero exit code", async () => {
    await expect(
      nodeCommandRunner.run(process.execPath, [
        "-e",
        'process.stdout.write("connected")',
      ]),
    ).resolves.toEqual({
      stdout: "connected",
      stderr: "",
      code: 0,
    });
  });

  it("returns both output channels and a non-zero exit code without rejecting", async () => {
    await expect(
      nodeCommandRunner.run(process.execPath, [
        "-e",
        'process.stdout.write("failed"); process.stderr.write("denied"); process.exit(7)',
      ]),
    ).resolves.toEqual({
      stdout: "failed",
      stderr: "denied",
      code: 7,
    });
  });

  it("preserves launchctl's not-loaded diagnostic from stderr", async () => {
    await expect(
      nodeCommandRunner.run(process.execPath, [
        "-e",
        'process.stderr.write("No such process"); process.exit(3)',
      ]),
    ).resolves.toEqual({
      stdout: "",
      stderr: "No such process",
      code: 3,
    });
  });

  it("passes arguments literally instead of interpreting them in a shell", async () => {
    const shellExpression = "$(printf interpreted)";

    await expect(
      nodeCommandRunner.run(process.execPath, [
        "-e",
        "process.stdout.write(process.argv[1])",
        shellExpression,
      ]),
    ).resolves.toEqual({
      stdout: shellExpression,
      stderr: "",
      code: 0,
    });
  });

  it("runs in the requested working directory", async () => {
    const directory = await mkdtemp(
      path.join(tmpdir(), "meld-command-runner-"),
    );

    try {
      const result = await nodeCommandRunner.run(
        process.execPath,
        ["-e", "process.stdout.write(process.cwd())"],
        { cwd: directory },
      );

      expect(await realpath(result.stdout.trim())).toBe(
        await realpath(directory),
      );
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });

  it("replaces the environment instead of extending the parent's", async () => {
    process.env.MELD_COMMAND_RUNNER_SENTINEL = "leaked";

    try {
      const result = await nodeCommandRunner.run(
        process.execPath,
        [
          "-e",
          "process.stdout.write(JSON.stringify(process.env))",
        ],
        { env: { MELD_MANAGED: "yes" } },
      );

      // macOS re-adds `__CF_USER_TEXT_ENCODING` to every child regardless of
      // the environment it was given, so it is the one key excluded here.
      const observed = JSON.parse(result.stdout) as Record<string, string>;
      delete observed.__CF_USER_TEXT_ENCODING;
      expect(observed).toEqual({ MELD_MANAGED: "yes" });
    } finally {
      delete process.env.MELD_COMMAND_RUNNER_SENTINEL;
    }
  });

  it("inherits the parent environment when no environment is supplied", async () => {
    process.env.MELD_COMMAND_RUNNER_SENTINEL = "inherited";

    try {
      const result = await nodeCommandRunner.run(process.execPath, [
        "-e",
        "process.stdout.write(process.env.MELD_COMMAND_RUNNER_SENTINEL ?? '')",
      ]);

      expect(result.stdout).toBe("inherited");
    } finally {
      delete process.env.MELD_COMMAND_RUNNER_SENTINEL;
    }
  });

  it("rejects rather than resolving when the command cannot be spawned", async () => {
    await expect(
      nodeCommandRunner.run(
        path.join(tmpdir(), "meld-missing-command-runner-binary"),
        ["--version"],
      ),
    ).rejects.toMatchObject({ code: "ENOENT" });
  });
});
