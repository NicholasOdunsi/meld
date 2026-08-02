import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  MAX_PROCESS_OUTPUT_BYTES,
  PROCESS_TERMINATION_GRACE_MS,
  ProcessRunError,
  createProcessRunner,
  nodeProcessRunner,
} from "./process-runner";

const directories: string[] = [];

async function workspace(): Promise<string> {
  const directory = await mkdtemp(path.join(tmpdir(), "meld-process-runner-"));
  directories.push(directory);
  return directory;
}

async function waitForFile(file: string): Promise<void> {
  const deadline = Date.now() + 10_000;
  for (;;) {
    try {
      await stat(file);
      return;
    } catch {
      if (Date.now() > deadline) {
        throw new Error(`timed out waiting for ${file}`);
      }
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
  }
}

function isAlive(pid: number): boolean {
  try {
    process.kill(pid, 0);
    return true;
  } catch {
    return false;
  }
}

afterEach(async () => {
  await Promise.all(
    directories
      .splice(0)
      .map((directory) => rm(directory, { recursive: true, force: true })),
  );
});

describe("process runner", () => {
  it("returns both output channels and the exit code", async () => {
    const cwd = await workspace();

    await expect(
      nodeProcessRunner.run({
        executable: process.execPath,
        args: [
          "-e",
          'process.stdout.write("reply"); process.stderr.write("note"); process.exit(3)',
        ],
        cwd,
        env: {},
      }),
    ).resolves.toMatchObject({
      stdout: "reply",
      stderr: "note",
      code: 3,
      signal: null,
      aborted: false,
      stdoutTruncated: false,
      stderrTruncated: false,
    });
  });

  it("passes arguments literally instead of interpreting them in a shell", async () => {
    const cwd = await workspace();
    const shellExpression = "$(printf interpreted); `printf also`";

    const result = await nodeProcessRunner.run({
      executable: process.execPath,
      args: [
        "-e",
        "process.stdout.write(process.argv[1])",
        shellExpression,
      ],
      cwd,
      env: {},
    });

    expect(result.stdout).toBe(shellExpression);
  });

  it("gives the child exactly the supplied environment and working directory", async () => {
    const cwd = await workspace();
    process.env.MELD_PROCESS_RUNNER_SENTINEL = "leaked";

    try {
      const result = await nodeProcessRunner.run({
        executable: process.execPath,
        args: [
          "-e",
          "process.stdout.write(JSON.stringify({ env: process.env, cwd: process.cwd() }))",
        ],
        cwd,
        env: { CODEX_HOME: "/managed/home" },
      });

      const observed = JSON.parse(result.stdout) as {
        env: Record<string, string>;
        cwd: string;
      };
      // macOS re-adds `__CF_USER_TEXT_ENCODING` to every child regardless of
      // the environment it was given, so it is the one key excluded here.
      delete observed.env.__CF_USER_TEXT_ENCODING;
      expect(observed.env).toEqual({ CODEX_HOME: "/managed/home" });
      expect(await realpath(observed.cwd)).toBe(await realpath(cwd));
    } finally {
      delete process.env.MELD_PROCESS_RUNNER_SENTINEL;
    }
  });

  it("writes the supplied stdin and then closes it", async () => {
    const cwd = await workspace();

    const result = await nodeProcessRunner.run({
      executable: process.execPath,
      args: [
        "-e",
        "let seen = ''; process.stdin.on('data', (c) => { seen += c; }); process.stdin.on('end', () => process.stdout.write(seen));",
      ],
      cwd,
      env: {},
      stdin: "context payload",
    });

    expect(result.stdout).toBe("context payload");
    expect(result.code).toBe(0);
  });

  it("closes stdin immediately when no input is supplied", async () => {
    const cwd = await workspace();

    const result = await nodeProcessRunner.run({
      executable: process.execPath,
      args: [
        "-e",
        "process.stdin.on('end', () => process.stdout.write('closed')); process.stdin.resume();",
      ],
      cwd,
      env: {},
    });

    expect(result.stdout).toBe("closed");
  });

  it("bounds the stdout buffer and reports the truncation", async () => {
    const cwd = await workspace();
    const runner = createProcessRunner({ maxOutputBytes: 64 });

    const result = await runner.run({
      executable: process.execPath,
      args: ["-e", "process.stdout.write('a'.repeat(200000))"],
      cwd,
      env: {},
    });

    expect(result.stdout.length).toBe(64);
    expect(result.stdoutTruncated).toBe(true);
    expect(result.code).toBe(0);
  });

  it("bounds the stderr buffer independently", async () => {
    const cwd = await workspace();
    const runner = createProcessRunner({ maxOutputBytes: 32 });

    const result = await runner.run({
      executable: process.execPath,
      args: [
        "-e",
        "process.stderr.write('b'.repeat(100000)); process.stdout.write('ok')",
      ],
      cwd,
      env: {},
    });

    expect(result.stderr.length).toBe(32);
    expect(result.stderrTruncated).toBe(true);
    expect(result.stdout).toBe("ok");
    expect(result.stdoutTruncated).toBe(false);
  });

  it("defaults to a bounded buffer and a five second termination grace", () => {
    expect(PROCESS_TERMINATION_GRACE_MS).toBe(5_000);
    expect(MAX_PROCESS_OUTPUT_BYTES).toBeGreaterThan(0);
    expect(MAX_PROCESS_OUTPUT_BYTES).toBeLessThanOrEqual(4 * 1024 * 1024);
  });

  it("terminates the whole process group, not just the child", async () => {
    const cwd = await workspace();
    const grandchildFile = path.join(cwd, "grandchild.pid");
    const controller = new AbortController();

    const running = nodeProcessRunner.run({
      executable: process.execPath,
      args: [
        "-e",
        [
          "const { spawn } = require('node:child_process');",
          "const { writeFileSync } = require('node:fs');",
          "const child = spawn(process.execPath, ['-e', 'setTimeout(() => {}, 120000)']);",
          `writeFileSync(${JSON.stringify(grandchildFile)}, String(child.pid));`,
          "setTimeout(() => {}, 120000);",
        ].join(" "),
      ],
      cwd,
      env: {},
      signal: controller.signal,
    });

    await waitForFile(grandchildFile);
    const grandchild = Number(await readFile(grandchildFile, "utf8"));
    expect(isAlive(grandchild)).toBe(true);

    controller.abort();
    const result = await running;

    expect(result.aborted).toBe(true);
    expect(result.signal).toBe("SIGTERM");

    const deadline = Date.now() + 5_000;
    while (isAlive(grandchild) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 20));
    }
    expect(isAlive(grandchild)).toBe(false);
  });

  it("escalates to SIGKILL when the group ignores SIGTERM", async () => {
    const cwd = await workspace();
    const readyFile = path.join(cwd, "ready");
    const runner = createProcessRunner({ killGraceMs: 100 });
    const controller = new AbortController();

    const running = runner.run({
      executable: process.execPath,
      args: [
        "-e",
        [
          "process.on('SIGTERM', () => {});",
          "require('node:fs').writeFileSync(" +
            JSON.stringify(readyFile) +
            ", 'ready');",
          "setTimeout(() => {}, 120000);",
        ].join(" "),
      ],
      cwd,
      env: {},
      signal: controller.signal,
    });

    await waitForFile(readyFile);
    controller.abort();

    await expect(running).resolves.toMatchObject({
      aborted: true,
      signal: "SIGKILL",
      code: null,
    });
  });

  it("never spawns anything for an already aborted signal", async () => {
    const cwd = await workspace();
    const controller = new AbortController();
    controller.abort();

    await expect(
      nodeProcessRunner.run({
        executable: path.join(cwd, "must-not-run"),
        args: [],
        cwd,
        env: {},
        signal: controller.signal,
      }),
    ).rejects.toMatchObject({
      name: "ProcessRunError",
      reason: "aborted",
    });
  });

  it("reports a typed failure when the executable cannot be spawned", async () => {
    const cwd = await workspace();

    const failure = await nodeProcessRunner
      .run({
        executable: path.join(cwd, "missing-managed-binary"),
        args: ["--version"],
        cwd,
        env: {},
      })
      .catch((error: unknown) => error);

    expect(failure).toBeInstanceOf(ProcessRunError);
    expect(failure).toMatchObject({ reason: "spawn-failed" });
  });

  it("refuses a relative executable so nothing can resolve from PATH", async () => {
    const cwd = await workspace();

    await expect(
      nodeProcessRunner.run({
        executable: "codex",
        args: ["--version"],
        cwd,
        env: {},
      }),
    ).rejects.toMatchObject({
      name: "ProcessRunError",
      reason: "relative-executable",
    });
  });
});
