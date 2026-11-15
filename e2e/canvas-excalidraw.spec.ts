import { test, expect } from "@playwright/test";

export const route = "/dev/canvas-excalidraw";

test("mounts Excalidraw with no tldraw", async ({ page }) => {
  const requests: string[] = [];
  const errors: string[] = [];
  page.on("request", (request) => requests.push(request.url()));
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await expect(page.getByText("Canvas lab · Excalidraw spike")).toBeVisible();
  expect(requests.some((url) => url.includes("tldraw"))).toBe(false);
  expect(errors).toEqual([]);
});
