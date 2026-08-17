import { expect, test } from "@playwright/test";

const E2E_WORKSPACE_ID =
  "00000000-0000-4000-8000-000000000001";
const E2E_ROOM_ID = "40000000-0000-4000-8000-000000000001";

test.beforeEach(async ({ context }, testInfo) => {
  const applicationOrigin = testInfo.project.use.baseURL;
  if (typeof applicationOrigin !== "string") {
    throw new Error("Playwright baseURL is required for PRD E2E auth.");
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

test("a room with a PRD shows the PRD tab and renders the document", async ({
  page,
}) => {
  await page.goto(
    `/${E2E_WORKSPACE_ID}/rooms/${E2E_ROOM_ID}?tab=conversation`,
  );

  const prdTab = page.getByRole("link", { name: /^PRD/ });
  await expect(prdTab).toBeVisible();
  const prdHref =
    `/${E2E_WORKSPACE_ID}/rooms/${E2E_ROOM_ID}?tab=prd`;
  await expect(prdTab).toHaveAttribute("href", prdHref);
  // Under `next dev`, a tab-link click can land before the client handler is
  // wired and be lost, leaving the URL on the Conversation tab; re-click until
  // it settles (the same toPass pattern #9 added for other room-tab clicks).
  await expect(async () => {
    await prdTab.click();
    await expect(page).toHaveURL(/tab=prd/, { timeout: 3_000 });
  }).toPass({ timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Checkout redesign" }),
  ).toBeVisible();
  await expect(
    page.getByRole("heading", { name: "Executive summary" }),
  ).toBeVisible();
});
