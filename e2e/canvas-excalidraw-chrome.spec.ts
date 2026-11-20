import { expect, test } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

test("Excalidraw's own UI is hidden and Orion's dock drives the tools", async ({ page }) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  for (const selector of [".App-toolbar-container", ".App-menu__left", ".layer-ui__wrapper__top-right", ".HintViewer", ".layer-ui__wrapper__footer", ".main-menu-trigger"]) {
    // Hidden by CSS: the elements may exist, but none may be visible.
    const matches = page.locator(selector);
    for (let index = 0; index < (await matches.count()); index += 1) await expect(matches.nth(index)).toBeHidden();
  }
  const dock = page.getByTestId("canvas-dock");
  await expect(dock).toBeVisible();
  // Flat rule: Orion's chrome has no drop shadows.
  expect(await dock.evaluate((element) => getComputedStyle(element).boxShadow)).toBe("none");
  // Rectangle, ellipse and arrow sit behind the one Shapes button.
  await expect(dock.getByRole("button", { name: "Rectangle" })).toHaveCount(0);
  await dock.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();
  expect(await page.evaluate(() => window.__orionBoard?.api.getAppState().activeTool.type)).toBe("rectangle");
});

test("drawing a rectangle shows the pill and recolours it", async ({ page }) => {
  await page.goto(route);
  const canvas = page.locator("canvas.excalidraw__canvas").last();
  await expect(canvas).toBeVisible();
  await page.getByTestId("canvas-dock").getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 400);
  await page.mouse.up();
  const pill = page.getByTestId("selection-pill");
  await expect(pill).toBeVisible();
  await pill.getByRole("button", { name: "Bold" }).click();
  expect(await page.evaluate(() => window.__orionBoard?.api.getSceneElements().at(-1)?.strokeWidth)).toBe(4);
});

test("zoom control zooms in", async ({ page }) => {
  await page.goto(route);
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(await page.evaluate(() => window.__orionBoard?.api.getAppState().zoom.value)).toBeCloseTo(1.25);
});
