import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, resolve } from "node:path";
import process from "node:process";
import { fileURLToPath, URL } from "node:url";
import { build } from "esbuild";

const packageRoot = fileURLToPath(new URL("../", import.meta.url));
const require = createRequire(import.meta.url);
const runtimePackages = ["react", "react-dom", "lucide-react", "clsx", "@tailwindcss/browser"];

export function runtimeStamp() {
  const { devDependencies } = JSON.parse(readFileSync(new URL("../package.json", import.meta.url), "utf8"));
  const versions = runtimePackages.map((name) => `${name}@${devDependencies[name]}`).join(",");
  return createHash("sha256").update(versions).digest("hex").slice(0, 16);
}

async function buildRuntime() {
  const result = await build({
    entryPoints: [resolve(packageRoot, "runtime/entry.ts")],
    bundle: true,
    format: "iife",
    minify: true,
    write: false,
    define: { "process.env.NODE_ENV": '"production"' },
  });
  // The package's exported entry is its standalone dist/index.global.js IIFE.
  const tailwind = await readFile(require.resolve("@tailwindcss/browser"), "utf8");
  const outputPath = resolve(packageRoot, "../../apps/web/public/screen-runtime/runtime.js");
  await mkdir(dirname(outputPath), { recursive: true });
  await writeFile(outputPath, `/* orion-screen-runtime ${runtimeStamp()} */\n${result.outputFiles[0].text}\n/* tailwindcss browser */\n${tailwind}\n`);
}

// Importing runtimeStamp from tests must not regenerate the checked-in asset.
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  await buildRuntime();
}
