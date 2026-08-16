import { defineConfig, devices } from "@playwright/test";

// Deliberately no webServer and no globalSetup: the sandbox proof needs a
// browser and nothing else, so it stays runnable when the stack is down.
export default defineConfig({
  testDir: "./e2e",
  testMatch: /prototype-(sandbox|overlay)\.spec\.ts/,
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["line"]] : "list",
  use: { ...devices["Desktop Chrome"], trace: "retain-on-failure" },
});
