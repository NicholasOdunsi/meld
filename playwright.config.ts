import { defineConfig, devices } from "@playwright/test";

// Overridable so the suite can run beside an already-running dev server.
const port = Number(process.env.MELD_E2E_PORT ?? 3000);
const baseURL = `http://127.0.0.1:${port}`;

export default defineConfig({
  testDir: "./e2e",
  // These specs drive the real sync gateway on a second port (18788) and are
  // owned by playwright.canvas-trial.config.ts, whose `testMatch` runs exactly
  // this set. This suite has no gateway behind it, so running them here only
  // yields ERR_CONNECTION_REFUSED. Keep this list in sync with that config's
  // testMatch.
  testIgnore: [
    "user-flow-trial.spec.ts",
    "design-canvas.spec.ts",
    "design-sketch-generate.spec.ts",
    "design-history-seed.spec.ts",
  ],
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
      MELD_E2E_DIST_DIR: ".next-e2e",
      MELD_E2E_FAKE_WORKSPACES: "true",
      MELD_E2E_FAKE_DISCOVERY: "true",
      MELD_E2E_FAKE_DEVICES: "true",
      // The Room lifecycle runs through User Flows: an empty Room offers to
      // start one, and starting it adds a surface. That entry point is behind
      // the trial flag, so the flag is on here. What is deliberately left off
      // is MELD_CANVAS_SESSION_SECRET and MELD_CANVAS_WS_URL: there is no sync
      // gateway behind this suite, so /api/canvas-session answers "not
      // configured yet" and the User Flows surface settles on that one state
      // instead of mounting an editor with nothing to sync to. tldraw itself
      // is proven against a real gateway in playwright.canvas-trial.config.ts.
      MELD_USER_FLOW_TRIAL_ENABLED: "true",
      MELD_DEVICE_PAIRING_SERVICE_ROLE_KEY:
        "e2e-placeholder-server-key",
      NEXT_PUBLIC_APP_URL: baseURL,
      INVITATION_TOKEN_SECRET:
        "6Lr5Xn3p2QVv8qFsa0RMXKFF23alHmmad4FUwx_JQDU",
    },
  },
});
