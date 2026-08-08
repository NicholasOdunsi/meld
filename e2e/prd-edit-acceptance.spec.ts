import { expect, test, type Page } from "@playwright/test";

const E2E_ORGANIZATION_ID =
  "00000000-0000-4000-8000-000000000001";
const E2E_ROOM_ID = "40000000-0000-4000-8000-000000000001";
const EDITED_SUMMARY =
  "Reduce checkout friction with a transparent mobile order summary.";
const EDITED_REQUIREMENT =
  "Keep a transparent order total visible at every checkout step.";
const POST_ACCEPTANCE_SUMMARY =
  "Reduce checkout friction with a transparent summary and delivery context.";

function dialogWithTitle(page: Page, title: string) {
  return page.getByRole("dialog").or(page.getByRole("alertdialog")).filter({
    has: page.getByRole("heading", { name: title, exact: true }),
  });
}

function statusRow(page: Page) {
  return page.getByText("Status", { exact: true }).locator("..");
}

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

test("an owner edits, reviews, accepts, and preserves accepted PRD history", async ({
  page,
}) => {
  await page.goto(
    `/${E2E_ORGANIZATION_ID}/discovery/${E2E_ROOM_ID}?tab=prd`,
  );

  await expect(
    page.getByRole("heading", { name: "Checkout redesign" }),
  ).toBeVisible();
  await expect(page.getByText("v1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByRole("textbox", { name: "Executive summary" })
    .fill(EDITED_SUMMARY);
  await page
    .getByRole("textbox", {
      name: "Functional requirements row 1",
      exact: true,
    })
    .fill(EDITED_REQUIREMENT);
  await page.getByRole("button", { name: "Save changes" }).first().click();

  await expect(page.getByText("v2", { exact: true })).toBeVisible();
  await expect(page.getByText(EDITED_SUMMARY)).toBeVisible();
  await expect(page.getByText(EDITED_REQUIREMENT)).toBeVisible();

  await page.reload();
  await expect(page.getByText("v2", { exact: true })).toBeVisible();
  await expect(page.getByText(EDITED_SUMMARY)).toBeVisible();
  await expect(page.getByText(EDITED_REQUIREMENT)).toBeVisible();

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Version history" }).click();
  const history = dialogWithTitle(page, "Version history");
  await expect(history.getByText("Version v2")).toBeVisible();
  await expect(history.getByText("Version v1")).toBeVisible();
  await expect(
    history.getByText("v2 compared with v1"),
  ).toBeVisible();
  await expect(history.getByText("Executive summary changed")).toBeVisible();
  await expect(
    history.getByText("Functional requirements: 1 added, 1 removed"),
  ).toBeVisible();
  await history.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Accept version" }).click();
  const acceptance = dialogWithTitle(page, "Accept version v2?");
  await acceptance
    .getByRole("button", { name: "Confirm acceptance" })
    .click();
  await expect(
    statusRow(page).getByText("Accepted", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByRole("textbox", { name: "Executive summary" })
    .fill(POST_ACCEPTANCE_SUMMARY);
  await page.getByRole("button", { name: "Save changes" }).first().click();

  await expect(page.getByText("v3", { exact: true })).toBeVisible();
  await expect(
    statusRow(page).getByText("Current draft", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Last accepted v2", { exact: true })).toBeVisible();
  await expect(page.getByText(POST_ACCEPTANCE_SUMMARY)).toBeVisible();

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Version history" }).click();
  const updatedHistory = dialogWithTitle(page, "Version history");
  await expect(updatedHistory.getByText("Version v3")).toBeVisible();
  // Version history compares the selected row with its nearest newer row, so
  // selecting v1 proves the immutable v2 snapshot is still compared to v1.
  await updatedHistory.getByRole("button", { name: /^Version v1 Draft/ }).click();
  await expect(
    updatedHistory.getByText("v2 compared with v1"),
  ).toBeVisible();
  await expect(
    updatedHistory.getByText("Functional requirements: 1 added, 1 removed"),
  ).toBeVisible();

  await updatedHistory.getByRole("button", { name: /^Version v3 Draft/ }).click();
  await expect(
    updatedHistory.getByText("v3 compared with v2"),
  ).toBeVisible();
  await expect(
    updatedHistory.getByText("Executive summary changed"),
  ).toBeVisible();
  await expect(
    updatedHistory.getByText(/^Functional requirements:/),
  ).toHaveCount(0);
});
