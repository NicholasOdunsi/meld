import { test, expect, type Page } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

// Embeddables ignore the pointer until activated: hover the centre, then click
// it. Excalidraw activates on a timeout after the click, so wait for the state.
async function activateFirstFrame(page: Page) {
  const container = page.locator(".excalidraw__embeddable-container").first();
  const box = await container.boundingBox();
  if (!box) throw new Error("No frame on the board");
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  const inner = container.locator(".excalidraw__embeddable-container__inner");
  await expect.poll(() => inner.evaluate((node) => getComputedStyle(node).pointerEvents)).not.toBe("none");
}

test("a sample screen renders with scripts on and the agreed sandbox", async ({ page }) => {
  await page.goto(route);
  await page.getByRole("button", { name: "Add sample screen" }).click();
  const iframe = page.locator('iframe[data-orion-frame="welcome"]');
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");
  await expect(page.frameLocator('iframe[data-orion-frame="welcome"]').locator("#js")).toHaveText("script ran");
});

test("the probe screen cannot reach the network, popups, the app or storage", async ({ page }) => {
  await page.goto(route);
  await page.getByRole("button", { name: "Add probe screen" }).click();
  const frame = page.frameLocator('iframe[data-orion-frame="probe"]');
  await expect(frame.locator("#network")).toHaveText("network: blocked");
  await expect(frame.locator("#popup")).toHaveText("popup: blocked");
  await expect(frame.locator("#parent")).toHaveText("parent: blocked");
  await expect(frame.locator("#storage")).toHaveText("storage: blocked");
  await expect(frame.locator("#native-bridge")).toHaveText("native bridge: absent");
});

test("a button in one screen switches the frame to another screen", async ({ page }) => {
  await page.goto(route);
  await page.getByRole("button", { name: "Add sample screen" }).click();
  await activateFirstFrame(page);
  await page.frameLocator('iframe[data-orion-frame="welcome"]').getByRole("button", { name: "Log in" }).click();
  await expect(page.locator('iframe[data-orion-frame="login"]')).toBeVisible();
  await expect(page.locator('iframe[data-orion-frame="welcome"]')).toHaveCount(0);
});
