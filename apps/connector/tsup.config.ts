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
  noExternal: ["@meld/contracts", "@meld/device-auth"],
});
