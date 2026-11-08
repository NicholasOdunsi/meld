// e2e/taste-profile.spec.ts
import { expect, test } from "@playwright/test";

// Fixtures from apps/web/src/features/rooms/e2e-fake.ts and
// apps/web/src/features/inspiration/taste/taste-fake.ts.
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";

test.beforeEach(async ({ context }, testInfo) => {
  const origin = testInfo.project.use.baseURL;
  if (typeof origin !== "string") throw new Error("Playwright baseURL is required for taste E2E auth.");
  await context.addCookies([
    { name: "meld-e2e-user-id", value: OWNER_ID, url: origin },
    { name: "meld-e2e-user-email", value: "owner@example.com", url: origin },
    { name: "meld-e2e-user-name", value: "Owner Example", url: origin },
  ]);
});

test("review taste updates one card at a time and add a dislike", async ({ page }) => {
  await page.goto(`/${WORKSPACE_ID}/inspiration?tab=taste`);
  await expect(page.getByTestId("taste-board")).toBeVisible();
  await expect(page.getByText("minimal · bold-type · airy")).toBeVisible();
  await expect(page.getByTestId("taste-attention")).toBeVisible();

  await page.getByRole("button", { name: "2 updates · Review" }).click();
  await expect(page.getByText("1 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Keep it" }).click();
  await expect(page.getByText("2 of 2")).toBeVisible();
  await page.getByRole("button", { name: "Not me" }).click();

  await expect(page.getByRole("button", { name: /updates · Review/ })).toHaveCount(0);
  await expect(page.getByRole("meter", { name: "Density: balanced" })).toBeVisible();
  await expect(page.getByText("Pill buttons")).toBeVisible(); // now under You avoid

  await page.getByLabel("Add a dislike").fill("gradients");
  // exact: true — sidebar "Add room to …" buttons also match name "Add".
  await page.getByRole("button", { name: "Add", exact: true }).click();
  await expect(page.getByText("gradients")).toBeVisible();
});
