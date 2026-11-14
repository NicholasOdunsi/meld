import { defineConfig, devices } from "@playwright/test";

const port = Number(process.env.MELD_E2E_PORT ?? 3018);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  testMatch: "canvas-excalidraw*.spec.ts",
  workers: 1,
  timeout: 90_000,
  expect: { timeout: 15_000 },
  use: {
    baseURL,
    trace: "retain-on-failure",
    ...devices["Desktop Chrome"],
    viewport: { width: 1440, height: 1000 },
  },
  webServer: {
    command: `pnpm --filter @meld/web exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: `${baseURL}/dev/canvas-excalidraw`,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      MELD_E2E_DIST_DIR: ".next-canvas-excalidraw",
      MELD_E2E_FAKE_WORKSPACES: "true",
    },
  },
});
