import { describe, expect, it } from "vitest";
import { nodeCommandRunner } from "./command-runner";

describe("node command runner", () => {
  it("returns stdout and the zero exit code", async () => {
    await expect(
      nodeCommandRunner.run(process.execPath, [
        "-e",
        'process.stdout.write("connected")',
      ]),
    ).resolves.toEqual({ stdout: "connected", code: 0 });
  });

  it("returns stdout and a non-zero exit code without rejecting", async () => {
    await expect(
      nodeCommandRunner.run(process.execPath, [
        "-e",
        'process.stdout.write("failed"); process.exit(7)',
      ]),
    ).resolves.toEqual({ stdout: "failed", code: 7 });
  });

  it("passes arguments literally instead of interpreting them in a shell", async () => {
    const shellExpression = "$(printf interpreted)";

    await expect(
      nodeCommandRunner.run(process.execPath, [
        "-e",
        "process.stdout.write(process.argv[1])",
        shellExpression,
      ]),
    ).resolves.toEqual({ stdout: shellExpression, code: 0 });
  });
});
