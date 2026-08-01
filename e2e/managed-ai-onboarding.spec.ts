import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const APPLICATION_ORIGIN = "http://127.0.0.1:3000";

const OWNER = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
  name: "Owner Example",
};

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
    {
      name: "meld-e2e-user-name",
      value: user.name,
      url: APPLICATION_ORIGIN,
    },
  ]);
}

// Create a workspace, pass the invitations step, and land on the managed-AI
// connection step. Returns the organization id.
async function reachConnectStep(page: Page): Promise<string> {
  await page.goto("/onboarding");
  await page
    .getByRole("textbox", { name: /organization name/i })
    .fill("Northwind");
  await page.locator('input[type="file"]').setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from("logo"),
  });
  await page.getByRole("button", { name: "Create workspace" }).click();

  // The invitations step.
  await expect(
    page.getByRole("heading", { name: "Invite your team.", exact: true }),
  ).toBeVisible();
  const organizationId = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByRole("button", { name: "Skip for now" }).click();

  // The managed-AI connection step.
  await expect(
    page.getByRole("heading", { name: "Connect your AI.", exact: true }),
  ).toBeVisible();
  return organizationId;
}

test.describe("managed AI onboarding", () => {
  test("connects Claude through install, authenticate, verify, and ready", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await authenticateContext(context, OWNER);
    const page = await context.newPage();

    const organizationId = await reachConnectStep(page);

    await page.getByRole("button", { name: "Connect Claude" }).click();

    // The durable server status drives the visible progress.
    await expect(page.getByTestId("setup-progress")).toBeVisible();

    // It advances to Ready, which exposes the Continue action.
    const continueButton = page.getByRole("button", { name: "Continue" });
    await expect(continueButton).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Claude is ready")).toBeVisible();

    await continueButton.click();
    await expect(page).toHaveURL(new RegExp(`/${organizationId}$`), {
      timeout: 15_000,
    });

    await context.close();
  });

  test("defers the connection with Set up later", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticateContext(context, OWNER);
    const page = await context.newPage();

    const organizationId = await reachConnectStep(page);

    await page.getByRole("button", { name: "Set up later" }).click();
    await expect(page).toHaveURL(new RegExp(`/${organizationId}$`), {
      timeout: 15_000,
    });

    await context.close();
  });
});
