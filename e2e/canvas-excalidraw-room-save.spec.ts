import { expect, test } from "@playwright/test";

const roomId = "40000000-0000-4000-8000-000000000001";

test("interactive preview waits for the room screen to save", async ({ page, context, baseURL }) => {
  await context.addCookies([
    { name: "meld-e2e-user-id", value: "10000000-0000-4000-8000-000000000001", url: baseURL! },
    { name: "meld-e2e-user-email", value: "owner@example.com", url: baseURL! },
    { name: "meld-e2e-user-name", value: "Owner Example", url: baseURL! },
  ]);
  await page.goto(`/dev/canvas-excalidraw?room=${roomId}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.getByRole("button", { name: "Add sample screen" }).click();
  await page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const frame = api.getSceneElements().find((element) => element.type === "embeddable")!;
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
  });
  const preview = page.getByRole("button", { name: "Open interactive preview" });
  await expect(preview).toBeEnabled();
  await page.evaluate(() => window.__orionBoard!.setScreen("welcome", "<h1>Saved revision</h1>"));
  await expect(preview).toBeDisabled();
  await expect(preview).toBeEnabled();
});
