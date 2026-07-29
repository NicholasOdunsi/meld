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
});
