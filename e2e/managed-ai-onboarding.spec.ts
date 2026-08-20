import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

// The origin cookies are pinned to. Derived from `MELD_E2E_PORT` exactly as
// `playwright.config.ts` derives `baseURL`: hardcoding port 3000 here silently
// unauthenticates every spec in this file whenever the suite is run on another
// port, which looks like a redirect-to-sign-in regression rather than a
// misconfiguration.
const APPLICATION_ORIGIN = `http://127.0.0.1:${
  process.env.MELD_E2E_PORT ?? 3000
}`;

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
// connection step. Returns the workspace id.
async function reachConnectStep(page: Page): Promise<string> {
  await page.goto("/onboarding");
  await page
    .getByRole("textbox", { name: /workspace name/i })
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
  const workspaceId = new URL(page.url()).pathname.split("/")[2]!;
  await page.getByRole("button", { name: "Skip for now" }).click();

  // The managed-AI connection step.
  await expect(
    page.getByRole("heading", { name: "Connect your AI.", exact: true }),
  ).toBeVisible();
  return workspaceId;
}

test.describe("managed AI onboarding", () => {
  test("connects Claude through install, authenticate, verify, and ready", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await authenticateContext(context, OWNER);
    const page = await context.newPage();

    const workspaceId = await reachConnectStep(page);

    // The ClickableCard exposes an empty a11y button behind its visible
    // content, which sits on top and intercepts pointer events; force the click
    // through to the card the way a real click on the content would land.
    await page
      .getByRole("button", { name: "Connect Claude" })
      .click({ force: true });

    // The durable server status drives the visible progress.
    await expect(page.getByTestId("setup-progress")).toBeVisible();

    // It advances to Ready, which exposes the Continue action.
    const continueButton = page.getByRole("button", { name: "Continue" });
    await expect(continueButton).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("Claude is ready")).toBeVisible();

    await continueButton.click();
    await expect(page).toHaveURL(new RegExp(`/${workspaceId}$`), {
      timeout: 15_000,
    });

    await context.close();
  });

  test("defers the connection with Set up later", async ({ browser }) => {
    const context = await browser.newContext();
    await authenticateContext(context, OWNER);
    const page = await context.newPage();

    const workspaceId = await reachConnectStep(page);

    await page.getByRole("button", { name: "Set up later" }).click();
    await expect(page).toHaveURL(new RegExp(`/${workspaceId}$`), {
      timeout: 15_000,
    });

    await context.close();
  });
});
