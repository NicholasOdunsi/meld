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
