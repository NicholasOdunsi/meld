import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

export function checkSource(source) {
  const failures = [];
  if (/<div(?:\s|>)/.test(source)) failures.push("raw <div> layout");
  if (
    /className=(?:["'`])[^"'`]*(?:\bp-\d|\bm-\d|\bflex\b|\bgrid\b|\bbg-|\btext-)/.test(
      source,
    )
  ) {
    failures.push("utility class");
  }
  if (/#[0-9a-f]{3,8}\b/i.test(source)) failures.push("hardcoded color");
  if (/style=\{\{[\s\S]*?["'`]\d+(?:\.\d+)?px["'`]/.test(source)) {
    failures.push("hardcoded pixel");
  }
  if (/@apply\b|tailwindcss/.test(source)) {
    failures.push("Tailwind compiler usage");
  }
  return failures;
}

export function checkTree(root) {
  const failures = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) {
      failures.push(...checkTree(path));
    } else if ([".tsx", ".ts", ".css"].includes(extname(path))) {
      for (const failure of checkSource(readFileSync(path, "utf8"))) {
        failures.push(`${path}: ${failure}`);
      }
    }
  }
  return failures;
}

function run() {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    console.error("Usage: node scripts/check-astryx-conventions.mjs <root> [...]");
    process.exitCode = 1;
    return;
  }

  const failures = roots.flatMap((root) => checkTree(root));
  for (const failure of failures) console.error(failure);
  if (failures.length > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run();
}
