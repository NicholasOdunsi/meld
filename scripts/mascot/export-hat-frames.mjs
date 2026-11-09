// Renders the Orion hat avatar to transparent PNGs for the Mac app.
// Run: node scripts/mascot/export-hat-frames.mjs   (needs `pnpm exec playwright install chromium` once)
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
  [join(root, "scripts/mascot/render-hat.tsx")],
  { cwd: join(root, "apps/web"), env: { ...process.env, NODE_PATH: join(root, "apps/web/node_modules") } },
).toString().trim().split("\n");
const svgs = Object.fromEntries(lines.map((line) => line.split("\t")));

// Gaze offsets in SVG units, matching the web sway (-5 → +6).
const GAZE = [-5, -2.5, 0, 3, 6];

const browser = await chromium.launch();
const page = await browser.newPage({ deviceScaleFactor: 3, viewport: { width: 96, height: 96 } });
async function shot(svg, gaze, file) {
  await page.setContent(
    `<style>html,body{margin:0;background:transparent}[data-part="look"]{transform:translate(${gaze}px,0)}</style>${svg}`,
  );
  await page.locator("svg").screenshot({ path: join(out, file), omitBackground: true });
}
for (const [index, gaze] of GAZE.entries()) await shot(svgs.neutral, gaze, `hat-neutral-${index}.png`);
await shot(svgs.curious, 0, "hat-curious.png");
await browser.close();
console.log(`Wrote ${GAZE.length + 1} frames to ${out}`);
