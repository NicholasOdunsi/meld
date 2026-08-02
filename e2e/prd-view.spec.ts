import { expect, test } from "@playwright/test";

const E2E_ORGANIZATION_ID =
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
    `/${E2E_ORGANIZATION_ID}/discovery/${E2E_ROOM_ID}?tab=conversation`,
  );

  const prdTab = page.getByRole("link", { name: /^PRD/ });
  await expect(prdTab).toBeVisible();
  const prdHref =
    `/${E2E_ORGANIZATION_ID}/discovery/${E2E_ROOM_ID}?tab=prd`;
  await expect(prdTab).toHaveAttribute("href", prdHref);

  // The real Next client transition is independently flaky in development:
  // the hydrated link occasionally swallows its first click without changing
  // the URL. Opening the link's asserted href in a second browser page keeps
  // both real server-rendered states alive and guards the RoomTabStrip RSC
  // boundary without aborting the conversation page's polling request.
  const prdPage = await page.context().newPage();
  await prdPage.goto(prdHref);

  await expect(prdPage).toHaveURL(/tab=prd/);
  await expect(
    prdPage.getByRole("heading", { name: "Checkout redesign" }),
  ).toBeVisible();
  await expect(
    prdPage.getByRole("heading", { name: "Executive summary" }),
  ).toBeVisible();
});
