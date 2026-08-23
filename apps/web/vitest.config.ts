import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
      "server-only": fileURLToPath(
        new URL("./vitest.server-only-stub.ts", import.meta.url),
      ),
    },
  },
  test: {
    // Shared jsdom shims for Astryx components, plus jest-dom matchers.
    setupFiles: ["./vitest.setup.ts"],
    // Vitest defaults to 5s, which this suite outgrew. The dialog and composer
    // tests drive real user-event interaction across a thousand-plus tests
    // running in parallel, and under that contention a test that takes ~400ms
    // on its own has been measured at 5.3s -- so it failed intermittently on a
    // busy machine while passing in isolation. Raising the ceiling does not
    // hide a hang (a genuinely stuck test still fails, just later); it stops a
    // scheduling artefact being reported as a broken test, which is worse
    // because it teaches everyone to re-run rather than read the failure.
    testTimeout: 20_000,
    server: {
      deps: {
        // @astryxdesign/core@0.1.8 ships one extensionless dynamic import
        // (`import('../Tooltip/Tooltip')` in Timestamp.js, while every static
        // import in that same file carries `.js`). Vitest externalises
        // node_modules and hands them to Node's native ESM loader, which
        // rejects extensionless specifiers — so any relative-format
        // `Timestamp` (which eagerly mounts the lazy Tooltip) blows up in
        // tests. Next's bundler resolves it fine, so this is a
        // test-environment-only problem; inlining the package lets Vite
        // resolve the import instead of Node.
        inline: ["@astryxdesign/core"],
      },
    },
  },
});
