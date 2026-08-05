import { defineConfig } from "@playwright/test";
// This package-level CLI bridge intentionally shares the workspace config;
// duplicating it here would let the filtered and root invocations drift.
// eslint-disable-next-line @typescript-eslint/no-restricted-imports
import rootConfig from "../../playwright.config";

// `pnpm --filter web exec` runs from this package directory. Reuse the root
// suite configuration while rebasing its two filesystem paths so the
// prescribed filtered invocation discovers the workspace-level E2E specs.
export default defineConfig({
  ...rootConfig,
  testDir: "../../e2e",
  globalSetup: "../../e2e/global-setup.ts",
});
