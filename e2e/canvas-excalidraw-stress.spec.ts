import { test, expect } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

test("a script that loops forever stays inert on the board", async ({ page }, testInfo) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.evaluate(() => window.__orionBoard!.addFixture("loop"));
  await expect(page.locator('iframe[data-orion-frame="loop"]')).toHaveAttribute("sandbox", "");
  const responsive = await Promise.race([
    page.evaluate(() => performance.now()).then(() => true).catch(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  await testInfo.attach("runaway-script.json", { body: JSON.stringify({ boardResponsiveAfter5s: responsive }), contentType: "application/json" });
  console.log("runaway script, board responsive after 5s:", responsive);
  expect(responsive).toBe(true);
});
