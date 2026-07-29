import { defineConfig } from "tsup";

export default defineConfig({
  entry: ["src/agent.ts", "src/cli.ts"],
  format: ["esm"],
  platform: "node",
  target: "node20",
  outDir: "dist",
  clean: true,
  splitting: false,
  sourcemap: true,
  outExtension: () => ({ js: ".mjs" }),
  banner: {
    js: [
      'import { createRequire as __meldCreateRequire } from "node:module";',
      "const require = __meldCreateRequire(import.meta.url);",
    ].join("\n"),
  },
  noExternal: [
    "@meld/contracts",
    "@meld/device-auth",
    "ws",
    "zod",
  ],
});
