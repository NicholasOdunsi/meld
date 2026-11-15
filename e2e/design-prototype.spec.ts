import { expect, test } from "@playwright/test";

const E2E_WORKSPACE_ID =
  "00000000-0000-4000-8000-000000000001";
const E2E_ROOM_ID = "40000000-0000-4000-8000-000000000001";
// Other specs (canvas-excalidraw-own-ai) build screens into this same fake room
// earlier in the run, so the screen count is not fixed; the seeded checkout
// screens are what this spec drives.
const PROTOTYPE_TITLE = /^Prototype preview \(\d+ screens?\)$/;

test.beforeEach(async ({ context }, testInfo) => {
  const applicationOrigin = testInfo.project.use.baseURL;
  if (typeof applicationOrigin !== "string") {
    throw new Error("Playwright baseURL is required for prototype E2E auth.");
  }

  await context.addCookies([
    {
      name: "meld-e2e-user-id",
      value: "10000000-0000-4000-8000-000000000001",
      url: applicationOrigin,
    },
    {
      name: "meld-e2e-user-email",
      value: "owner@example.com",
      url: applicationOrigin,
    },
    {
      name: "meld-e2e-user-name",
      value: "Owner Example",
      url: applicationOrigin,
    },
  ]);
});

test("a built room prototype renders and navigates between screens", async ({
  page,
}) => {
  await page.goto(
    `/${E2E_WORKSPACE_ID}/rooms/${E2E_ROOM_ID}?tab=prototype`,
  );

  const prototypeTab = page.getByRole("link", { name: "Prototype" });
  await expect(prototypeTab).toBeVisible();
  await expect(prototypeTab).toHaveAttribute(
    "href",
    `/${E2E_WORKSPACE_ID}/rooms/${E2E_ROOM_ID}?tab=prototype`,
  );

  const iframe = page.getByTitle(PROTOTYPE_TITLE);
  await expect(iframe).toBeVisible();
  await expect(iframe).toHaveAttribute("sandbox", "allow-scripts");

  const prototype = page.frameLocator(
    'iframe[title^="Prototype preview ("]',
  );
  await expect(
    prototype.getByRole("heading", { name: "Checkout prototype start" }),
  ).toBeVisible();

  await prototype.getByRole("button", { name: "Review order" }).click();

  await expect(
    prototype.getByRole("heading", { name: "Order review ready" }),
  ).toBeVisible();
  await expect(
    prototype.getByRole("heading", { name: "Checkout prototype start" }),
  ).toBeHidden();
});
