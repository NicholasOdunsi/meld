import { expect, test } from "@playwright/test";

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000001";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const SCREEN_ID = "71000000-0000-4000-8000-000000000001";

test.beforeEach(async ({ context }) => {
  const appBaseUrl =
    `http://127.0.0.1:${process.env.MELD_CANVAS_E2E_APP_PORT ?? 18788}`;
  await context.addCookies([
    { name: "meld-e2e-user-id", value: OWNER_ID, url: appBaseUrl },
    {
      name: "meld-e2e-user-email",
      value: "owner@example.com",
      url: appBaseUrl,
    },
    {
      name: "meld-e2e-user-name",
      value: "Owner Example",
      url: appBaseUrl,
    },
  ]);
});

test("a built design screen projects onto the Canvas with an inert preview", async ({
  page,
}) => {
  const appBaseUrl =
    `http://127.0.0.1:${process.env.MELD_CANVAS_E2E_APP_PORT ?? 18788}`;
  const roomPath = `/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=user-flows`;
  await page.goto(new URL(roomPath, appBaseUrl).toString());

  const canvasTab = page.getByRole("link", { name: "Canvas" });
  await expect(canvasTab).toBeVisible();
  await expect(canvasTab).toHaveAttribute("href", roomPath);
  await expect(page.getByTestId("user-flow-trial-canvas")).toBeVisible();

  const screenOverlay = page.locator(
    `[data-meld-screen-overlay="${SCREEN_ID}"]`,
  );
  await expect(screenOverlay).toBeAttached();

  const previewFrame = page.getByTitle(
    "Checkout prototype start canvas preview",
  );
  await expect(previewFrame).toBeAttached();
  await expect(previewFrame).toHaveAttribute("sandbox", "");

  const preview = page.frameLocator(
    'iframe[title="Checkout prototype start canvas preview"]',
  );
  await expect(
    preview.getByRole("heading", { name: "Checkout prototype start" }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Preview Checkout prototype start" }),
  ).toBeAttached();
});
