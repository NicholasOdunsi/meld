import { randomUUID } from "node:crypto";
import { test, expect, type Page } from "@playwright/test";

const key = (board: string) => `orion:canvas-excalidraw:${board}`;
const savedLength = (page: Page, board: string) => page.evaluate((k) => localStorage.getItem(k)?.length ?? 0, key(board));
const elementCount = (page: Page) => page.evaluate(() => window.__orionBoard!.api.getSceneElements().length);

async function drawRectangle(page: Page) {
  await page.evaluate(() => {
    const { api, convert } = window.__orionBoard!;
    const added = convert([{ type: "rectangle", id: "kept", x: 20, y: 20, width: 100, height: 60 }]);
    api.updateScene({ elements: [...api.getSceneElementsIncludingDeleted(), ...added] });
  });
}

test("a board and its screens survive a reload", async ({ page }) => {
  const board = randomUUID();
  await page.goto(`/dev/canvas-excalidraw?board=${board}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await drawRectangle(page);
  await page.getByRole("button", { name: "Add sample screen" }).click();
  await expect.poll(() => elementCount(page)).toBe(2);
  await expect.poll(() => savedLength(page, board)).toBeGreaterThan(0);
  await page.reload();
  await expect.poll(() => elementCount(page)).toBe(2);
  await expect(page.frameLocator('iframe[data-orion-frame="welcome"]').locator("#js")).toHaveText("script ran");
});

test("boards with different ids do not share content", async ({ page }) => {
  const first = randomUUID();
  await page.goto(`/dev/canvas-excalidraw?board=${first}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await drawRectangle(page);
  await expect.poll(() => savedLength(page, first)).toBeGreaterThan(0);
  await page.goto(`/dev/canvas-excalidraw?board=${randomUUID()}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  expect(await elementCount(page)).toBe(0);
});

test("a failed save is shown", async ({ page }) => {
  await page.addInitScript(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (name: string, value: string) {
      if (name.startsWith("orion:canvas-excalidraw:")) throw new DOMException("full", "QuotaExceededError");
      return original.call(this, name, value);
    };
  });
  await page.goto(`/dev/canvas-excalidraw?board=${randomUUID()}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await drawRectangle(page);
  await expect(page.getByText("Could not save this board in the browser", { exact: false })).toBeVisible();
});
