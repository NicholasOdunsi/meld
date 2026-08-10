import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.MELD_CANVAS_E2E_PORT ?? 18787);

export default defineConfig({
  testDir: "./e2e",
  testMatch: "user-flow-trial.spec.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 30_000,
  expect: { timeout: 10_000 },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...devices["Desktop Chrome"],
    trace: "retain-on-failure",
  },
  webServer: {
    command: `pnpm exec tsx apps/gateway/src/canvas/e2e-main.ts`,
    url: `http://127.0.0.1:${port}/health`,
    reuseExistingServer: false,
    timeout: 30_000,
    env: {
      ...process.env,
      MELD_CANVAS_E2E_PORT: String(port),
    },
  },
});
