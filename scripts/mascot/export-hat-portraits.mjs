// Renders the large Orion hat (illustration style) to transparent PNGs for the
// native Overview header. Run: node scripts/mascot/export-hat-portraits.mjs
// (needs `pnpm exec playwright install chromium` once).
import { execFileSync } from "node:child_process";
import { mkdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = join(dirname(fileURLToPath(import.meta.url)), "../..");
const out = join(root, "packages/orion-design-system/Sources/OrionDesignSystem/Resources/Mascot");
mkdirSync(out, { recursive: true });

const lines = execFileSync(
  join(root, "node_modules/.bin/tsx"),
  [join(root, "scripts/mascot/render-hat-portraits.tsx")],
  { cwd: join(root, "apps/web"), env: { ...process.env, NODE_PATH: join(root, "apps/web/node_modules") } },
).toString().trim().split("\n");

const browser = await chromium.launch();
// 200pt on screen at 3x.
const page = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 200, height: 200 } });
for (const line of lines) {
  const [expression, svg] = line.split("\t");
  // Freeze the speaking mouth mid-word; the app animates nothing in the PNG.
  await page.setContent(`<style>html,body{margin:0;background:transparent}*{animation:none!important}</style>${svg}`);
  await page.locator("svg").screenshot({ path: join(out, `hat-portrait-${expression}.png`), omitBackground: true });
}
await browser.close();
console.log(`Wrote ${lines.length} portraits to ${out}`);
