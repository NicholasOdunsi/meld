import { defineConfig } from "tsup";

const out = "../../apps/mac/Sources/Orion/Resources/PreviewEdit";

export default defineConfig([
  {
    entry: { "edit-helper": "src/cli.ts" },
    format: ["esm"],
    platform: "node",
    target: "node20",
    outDir: out,
    clean: false,
    splitting: false,
    minify: true,
    // The Mac's runtime has no node_modules: bundle everything.
    noExternal: [/.*/],
    outExtension: () => ({ js: ".mjs" }),
    banner: {
      js: [
        'import { createRequire as __meldCreateRequire } from "node:module";',
        "const require = __meldCreateRequire(import.meta.url);",
      ].join("\n"),
    },
  },
]);
