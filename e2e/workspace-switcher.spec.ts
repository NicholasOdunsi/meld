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
  await createWorkspaceLink.click({ force: true });
  await page.goto("/onboarding");
  const secondOrganizationId = await createWorkspace(page, {
    name: "Basecamp",
    logoFileName: "basecamp.png",
  });
  expect(secondOrganizationId).not.toBe(firstOrganizationId);

  const workspaceLinks = await workspaceRail
    .getByRole("link", { name: /Northstar|Basecamp/ })
    .all();
  expect(workspaceLinks).toHaveLength(2);
  await expect(workspaceLinks[0]).toHaveAccessibleName("Northstar");
  await expect(workspaceLinks[1]).toHaveAccessibleName("Basecamp");
  await expect(workspaceLinks[1]).toHaveAttribute("aria-current", "page");
  await expect(workspaceLinks[0]).not.toHaveAttribute("aria-current");

  await workspaceLinks[0].hover();
  await expect(page.getByRole("tooltip")).toHaveText("Northstar");

  await workspaceLinks[0].click();
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
