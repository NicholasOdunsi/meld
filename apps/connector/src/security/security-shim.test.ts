import { mkdtemp, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { connectorPaths } from "../config/paths";
import { ensureSecurityShim } from "./security-shim";

const run = promisify(execFile);

let root: string;

beforeEach(async () => {
  root = await mkdtemp(path.join(tmpdir(), "meld-shim-"));
});

afterEach(async () => {
  await rm(root, { recursive: true, force: true });
});

describe("security shim", () => {
  it("writes an executable that exits 44 (item not found) for any keychain call", async () => {
    const paths = connectorPaths(root);
    await ensureSecurityShim(paths);

    const info = await stat(paths.securityShim);
    expect(info.isFile()).toBe(true);
    // Owner-executable bit set.
    expect(info.mode & 0o100).toBe(0o100);

    // Claude reads exit code 44 as "keychain reachable but empty", which routes
    // it to the plaintext .credentials.json store for both reads and writes.
    const result = await run(paths.securityShim, [
      "find-generic-password",
      "-a",
      "acct",
      "-s",
      "svc",
      "-w",
    ]).then(
      () => ({ code: 0 }),
      (error: { code?: number }) => ({ code: error.code ?? -1 }),
    );
    expect(result.code).toBe(44);
  });

  it("is idempotent -- a second call leaves a working shim", async () => {
    const paths = connectorPaths(root);
    await ensureSecurityShim(paths);
    await ensureSecurityShim(paths);

    const result = await run(paths.securityShim, ["add-generic-password"]).then(
      () => ({ code: 0 }),
      (error: { code?: number }) => ({ code: error.code ?? -1 }),
    );
    expect(result.code).toBe(44);
  });
});
