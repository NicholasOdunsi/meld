import { expect, test } from "@playwright/test";

const workspaceId = "00000000-0000-4000-8000-000000000001";
const roomId = "40000000-0000-4000-8000-000000000003";
const roomPath = `/${workspaceId}/rooms/${roomId}?tab=user-flows`;

test("the main room Canvas opens a dark, server-saved board with a legacy link", async ({ page, context, baseURL }) => {
  test.setTimeout(180_000);
  await context.addCookies([
    { name: "meld-e2e-user-id", value: "10000000-0000-4000-8000-000000000001", url: baseURL! },
    { name: "meld-e2e-user-email", value: "owner@example.com", url: baseURL! },
    { name: "meld-e2e-user-name", value: "Owner Example", url: baseURL! },
  ]);
  await page.goto(roomPath, { waitUntil: "domcontentloaded" });
  await expect(page.getByRole("link", { name: "Canvas", exact: true })).toHaveAttribute("href", roomPath);
  await expect(page.getByRole("link", { name: "Open previous canvas" })).toHaveAttribute("href", `${roomPath}&canvas=legacy`);
  await expect(page.getByRole("application", { name: "Board workspace" })).toBeVisible();
  await expect(page.locator(".excalidraw.theme--dark")).toBeVisible();
  await page.evaluate(() => window.__orionBoard!.addFixture("sample"));
  await expect(page.locator('iframe[data-orion-frame="welcome"]')).toBeVisible();
  await page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const frame = api.getSceneElements().find((element) => element.type === "embeddable")!;
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
  });
  await expect(page.getByRole("button", { name: "Preview screen" })).toBeEnabled();
  await page.reload();
  await expect(page.locator('iframe[data-orion-frame="welcome"]')).toBeVisible();
  await page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const frame = api.getSceneElements().find((element) => element.type === "embeddable")!;
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
  });
  const popupPromise = context.waitForEvent("page");
  await page.getByRole("button", { name: "Preview screen" }).click();
  const preview = await popupPromise;
  await expect(preview.getByRole("heading", { name: "Welcome" })).toBeVisible();
  expect(preview.url()).toContain(`/api/rooms/${roomId}/canvas-preview/welcome`);
});
