import { expect, test, type BrowserContext, type Page } from "@playwright/test";

const APPLICATION_ORIGIN = "http://127.0.0.1:3000";

async function authenticateContext(
  context: BrowserContext,
  user: { id: string; email: string; name: string },
) {
  await context.addCookies([
    { name: "meld-e2e-user-id", value: user.id, url: APPLICATION_ORIGIN },
    {
      name: "meld-e2e-user-email",
      value: user.email,
      url: APPLICATION_ORIGIN,
    },
    { name: "meld-e2e-user-name", value: user.name, url: APPLICATION_ORIGIN },
  ]);
}

async function createWorkspace(
  page: Page,
  input: { name: string; logoFileName: string },
) {
  await page
    .getByRole("textbox", { name: /organization name/i })
    .fill(input.name);
  await page.locator('input[type="file"]').setInputFiles({
    name: input.logoFileName,
    mimeType: "image/png",
    buffer: Buffer.from(`${input.name} logo`),
  });
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(
    page.getByRole("heading", { name: "Invite your team.", exact: true }),
  ).toBeVisible();
  const organizationId = new URL(page.url()).pathname.split("/")[2];

  await page.getByRole("button", { name: "Skip for now" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Setting up your workspace.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(page).toHaveURL(new RegExp(`/${organizationId}$`), {
    timeout: 15_000,
  });

  return organizationId;
}

test("switches between workspaces from the rail", async ({ browser }) => {
  const context = await browser.newContext();
  await authenticateContext(context, {
    id: "70000000-0000-4000-8000-000000000007",
    email: "switcher@example.com",
    name: "Switcher Example",
  });
  const page = await context.newPage();

  await page.goto("/onboarding");
  const firstOrganizationId = await createWorkspace(page, {
    name: "Northstar",
    logoFileName: "northstar.png",
  });

  const workspaceRail = page.getByTestId("workspace-rail");
  await expect(
    workspaceRail.getByRole("link", { name: "Northstar" }),
  ).toHaveAttribute("aria-current", "page");

  const createWorkspaceLink = workspaceRail.getByRole("link", {
    name: "Create workspace",
  });
  await expect(createWorkspaceLink).toHaveAttribute("href", "/onboarding");
  await createWorkspaceLink.click();
  await expect(page).toHaveURL(/\/onboarding$/);
  const secondOrganizationId = await createWorkspace(page, {
    name: "Basecamp",
    logoFileName: "basecamp.png",
  });
  expect(secondOrganizationId).not.toBe(firstOrganizationId);

  const workspaceLinks = workspaceRail.getByRole("link", {
    name: /Northstar|Basecamp/,
  });
  await expect(workspaceLinks).toHaveCount(2);
  const firstWorkspaceLink = workspaceLinks.nth(0);
  const secondWorkspaceLink = workspaceLinks.nth(1);
  await expect(firstWorkspaceLink).toHaveAccessibleName("Northstar");
  await expect(secondWorkspaceLink).toHaveAccessibleName("Basecamp");
  await expect(secondWorkspaceLink).toHaveAttribute("aria-current", "page");
  await expect(firstWorkspaceLink).not.toHaveAttribute("aria-current");

  await firstWorkspaceLink.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Northstar");

  await firstWorkspaceLink.click();
  await expect(page).toHaveURL(new RegExp(`/${firstOrganizationId}$`));
  await expect(
    page
      .getByTestId("dashboard-side-nav")
      .getByText("Northstar", { exact: true }),
  ).toBeVisible();
  await expect(
    workspaceRail.getByRole("link", { name: "Northstar" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    workspaceRail.getByRole("link", { name: "Basecamp" }),
  ).not.toHaveAttribute("aria-current");

  await context.close();
});
