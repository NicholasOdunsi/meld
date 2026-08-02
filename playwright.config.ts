import { defineConfig, devices } from "@playwright/test";

// Overridable so the suite can run beside an already-running dev server.
const port = Number(process.env.MELD_E2E_PORT ?? 3000);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  globalSetup: "./e2e/global-setup.ts",
  fullyParallel: false,
  workers: 1,
  // Cold `next dev` compiles on the shared CI runner make the occasional
  // interaction race with client hydration (a Send click landing a beat before
  // the handler is wired), even though the suite passes deterministically
  // locally. Retry in CI so genuine timing hiccups don't fail the run; a real
  // regression still fails every attempt. No retries locally, where the timing
  // is stable and a flake should be investigated, not hidden.
  retries: process.env.CI ? 2 : 0,
  // Generous because these are cold-start budgets, not behavioural ones: even
  // after global-setup warms every route, the first render of a page in `next
  // dev` is slow on a CI runner.
  timeout: 120_000,
  expect: {
    timeout: 30_000,
  },
  use: {
    baseURL,
    navigationTimeout: 60_000,
    trace: "retain-on-failure",
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
  webServer: {
    command: `pnpm --filter web exec next dev --hostname 127.0.0.1 --port ${port}`,
    url: baseURL,
    reuseExistingServer: false,
    timeout: 120_000,
    env: {
      ...process.env,
      MELD_E2E_FAKE_WORKSPACES: "true",
      MELD_E2E_FAKE_DISCOVERY: "true",
      MELD_E2E_FAKE_DEVICES: "true",
      MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY:
        "e2e-placeholder-server-key",
      NEXT_PUBLIC_APP_URL: baseURL,
      INVITATION_TOKEN_SECRET:
        "6Lr5Xn3p2QVv8qFsa0RMXKFF23alHmmad4FUwx_JQDU",
    },
  },
});
