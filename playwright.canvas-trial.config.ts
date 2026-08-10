import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.MELD_CANVAS_E2E_PORT ?? 18787);
const appPort = Number(process.env.MELD_CANVAS_E2E_APP_PORT ?? 18788);
const appBaseUrl = `http://127.0.0.1:${appPort}`;
const canvasSecret =
  "canvas-trial-e2e-secret-0123456789-abcdefghijklmnopqrstuvwxyz";

export default defineConfig({
  testDir: "./e2e",
  testMatch: "user-flow-trial.spec.ts",
  globalSetup: "./e2e/canvas-trial-global-setup.ts",
  fullyParallel: false,
  workers: 1,
  timeout: 120_000,
  expect: { timeout: 30_000 },
  reporter: process.env.CI ? [["line"], ["html", { open: "never" }]] : "list",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    ...devices["Desktop Chrome"],
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
  },
  webServer: [
    {
      command: `pnpm exec tsx apps/gateway/src/canvas/e2e-main.ts`,
      url: `http://127.0.0.1:${port}/health`,
      reuseExistingServer: false,
      timeout: 30_000,
      env: {
        ...process.env,
        NODE_ENV: "test",
        MELD_CANVAS_E2E_ALLOW_TEST_SECRET: "true",
        MELD_CANVAS_E2E_PORT: String(port),
      },
    },
    {
      command: `pnpm --filter web exec next dev --hostname 127.0.0.1 --port ${appPort}`,
      url: appBaseUrl,
      reuseExistingServer: false,
      timeout: 120_000,
      env: {
        ...process.env,
        MELD_E2E_DIST_DIR: ".next-e2e",
        MELD_E2E_FAKE_WORKSPACES: "true",
        MELD_E2E_FAKE_DISCOVERY: "true",
        MELD_E2E_FAKE_DEVICES: "true",
        MELD_USER_FLOW_TRIAL_ENABLED: "true",
        MELD_CANVAS_SESSION_SECRET: canvasSecret,
        MELD_CANVAS_WS_URL: `ws://127.0.0.1:${port}`,
        NEXT_PUBLIC_APP_URL: appBaseUrl,
      },
    },
  ],
});
