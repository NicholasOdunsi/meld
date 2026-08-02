import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["src/**/*.integration.test.ts"],
    // The provider-setup and task-executor suites spawn real fake-binary
    // processes and seed process.env with credential sentinels, so they must
    // run serially -- a parallel worker would both contend on spawned children
    // and observe another suite's mutated environment. The pairing suite drives
    // a live gateway and database. The generous timeouts cover both.
    fileParallelism: false,
    maxWorkers: 1,
    hookTimeout: 60_000,
    testTimeout: 60_000,
  },
});
