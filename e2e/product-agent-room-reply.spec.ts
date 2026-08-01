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

// Create a workspace and one Discovery Room, returning the room URL so a second
// browser context can open the very same room.
async function createRoom(page: Page): Promise<string> {
  await page.goto("/onboarding");
  await page
    .getByRole("textbox", { name: /organization name/i })
    .fill("Assumption Labs");
  await page.locator('input[type="file"]').setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from("logo"),
  });
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Invite your team.", exact: true }),
  ).toBeVisible();
  const organizationId = new URL(page.url()).pathname.split("/")[2];
  await page.getByRole("button", { name: "Skip for now" }).click();
  // Invite skip now lands on the managed-AI connection step; defer it.
  await page.getByRole("button", { name: "Set up later" }).click();
  await expect(page).toHaveURL(new RegExp(`/${organizationId}$`), {
    timeout: 15_000,
  });

  await page.goto(`/${organizationId}/discovery`);
  await page
    .getByRole("textbox", { name: "Room name" })
    .fill("Onboarding assumptions");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(
    page.getByRole("heading", {
      name: "Onboarding assumptions",
      exact: true,
    }),
  ).toBeVisible();
  return page.url();
}

test.describe("Product Agent room reply", () => {
  test("mentions the agent, chooses Codex, and posts one shared reply", async ({
    browser,
  }) => {
    const ownerContext = await browser.newContext();
    await authenticateContext(ownerContext, OWNER);
    const page = await ownerContext.newPage();

    const roomUrl = await createRoom(page);

    // A Product Agent mention exposes the per-task provider picker.
    await page
      .getByRole("combobox", { name: "Message" })
      .fill("@Product Agent challenge this assumption");
    await expect(page.getByTestId("agent-provider-picker")).toBeVisible();

    // Choose Codex explicitly (the picker follows the Astryx Selector pattern).
    await page
      .getByRole("combobox", { name: "Product Agent provider" })
      .click();
    await page.getByRole("option", { name: "Codex", exact: true }).click();

    await page.getByRole("button", { name: "Send" }).click();

    // The human message persists first and unconditionally.
    await expect(
      page.getByText("challenge this assumption").first(),
    ).toBeVisible();

    // A pending queued/running state appears while the fake connector works.
    await expect(page.getByTestId("agent-task-state")).toBeVisible();

    // The fake connector completes and posts exactly one Product Agent reply.
    const replyText = "challenges the assumption";
    await expect(page.getByText(replyText).first()).toBeVisible({
      timeout: 30_000,
    });
    // Once settled, the pending affordance is gone.
    await expect(page.getByTestId("agent-task-state")).toHaveCount(0);
    await expect(page.getByText(replyText)).toHaveCount(1);

    // A second browser context on the same room sees the same one reply.
    const secondContext = await browser.newContext();
    await authenticateContext(secondContext, OWNER);
    const secondPage = await secondContext.newPage();
    await secondPage.goto(roomUrl);
    await expect(secondPage.getByText(replyText).first()).toBeVisible({
      timeout: 30_000,
    });
    await expect(secondPage.getByText(replyText)).toHaveCount(1);

    await secondContext.close();
    await ownerContext.close();
  });
});
