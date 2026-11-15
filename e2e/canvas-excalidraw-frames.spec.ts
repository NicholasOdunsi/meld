import { test, expect } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

test("a sample screen renders without running its script", async ({ page }) => {
  await page.goto(route);
  await page.getByRole("button", { name: "Add sample screen" }).click();
  const iframe = page.locator('iframe[data-orion-frame="welcome"]');
  await expect(iframe).toHaveAttribute("sandbox", "");
  await expect(page.frameLocator('iframe[data-orion-frame="welcome"]').locator("#js")).toHaveText("script has not run");
  await expect(page.getByRole("button", { name: "Clear board" })).toBeEnabled();
});

test("the probe screen stays static on the board", async ({ page }) => {
  await page.goto(route);
  await page.getByRole("button", { name: "Add probe screen" }).click();
  const frame = page.frameLocator('iframe[data-orion-frame="probe"]');
  await expect(frame.getByRole("heading", { name: "Probe" })).toBeVisible();
  await expect(frame.locator("#out")).toBeEmpty();
});

test("a saved runaway screen cannot block board controls", async ({ page }) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.evaluate(() => window.__orionBoard!.addFixture("loop"));
  await expect(page.frameLocator('iframe[data-orion-frame="loop"]').getByRole("heading", { name: "Loop" })).toBeVisible();
  await page.getByRole("button", { name: "Clear board" }).click();
  await expect(page.locator('iframe[data-orion-frame="loop"]')).toHaveCount(0);
});
