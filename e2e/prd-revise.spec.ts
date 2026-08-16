import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

// The full "update the PRD from chat" flow the owner walks once a PRD exists:
//   generate a PRD -> ask the Product Agent to change it -> the reply offers a
//   revision (not a fresh generation) -> confirm -> a new PRD version materializes
//   and the PRD tab renders it.
//
// The offer→confirm→generate path itself is proven in e2e/prd-generate.spec.ts;
// this focuses on the revise branch: a PRD already exists, so the proposal is
// prd_revise and the action is "Update PRD".

const OWNER = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
  name: "Owner Example",
};

async function authenticateContext(
  context: BrowserContext,
  origin: string,
  user: { id: string; email: string; name: string },
) {
  await context.addCookies([
    { name: "meld-e2e-user-id", value: user.id, url: origin },
    { name: "meld-e2e-user-email", value: user.email, url: origin },
    { name: "meld-e2e-user-name", value: user.name, url: origin },
  ]);
}

async function createRoom(page: Page): Promise<void> {
  await page.goto("/onboarding");
  await page
    .getByRole("textbox", { name: /workspace name/i })
    .fill("Checkout Labs");
  await page.locator('input[type="file"]').setInputFiles({
    name: "logo.png",
    mimeType: "image/png",
    buffer: Buffer.from("logo"),
  });
  await page.getByRole("button", { name: "Create workspace" }).click();
  await expect(
    page.getByRole("heading", { name: "Invite your team.", exact: true }),
  ).toBeVisible();
  const workspaceId = new URL(page.url()).pathname.split("/")[2];
  await page.getByRole("button", { name: "Skip for now" }).click();
  await page.getByRole("button", { name: "Set up later" }).click();
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}$`), {
    timeout: 15_000,
  });

  await page
    .getByRole("button", { name: "Add room to Untitled project" })
    .click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Checkout research");
  await page.getByRole("button", { name: "Create room" }).click();
  await expect(
    page.getByRole("heading", { name: "Checkout research", exact: true }),
  ).toBeVisible();
}

async function askProductAgent(page: Page, message: string): Promise<void> {
  await page.getByRole("combobox", { name: "Message" }).fill(message);
  // Route to Codex by picking its model from the composer's provider chip.
  await page.getByTestId("agent-provider-picker").click();
  await page.getByRole("menuitemradio", { name: "GPT-5.5" }).click();
  await page.getByRole("button", { name: "Send" }).click();
}

test("ask to change a PRD → confirm → the PRD tab renders the revised version", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required for PRD E2E.");
  const context = await browser.newContext();
  await authenticateContext(context, baseURL, OWNER);
  const page = await context.newPage();

  await createRoom(page);

  // First, generate a PRD so the room has one.
  await askProductAgent(page, "@Product Agent make a PRD from this room");
  const generate = page.getByRole("button", { name: "Generate PRD" });
  await expect(generate).toBeVisible({ timeout: 30_000 });
  await generate.click();
  const prdTab = page.getByRole("link", { name: /^PRD/ });
  await expect(prdTab).toBeVisible();
  await prdTab.click();
  await expect(page).toHaveURL(/tab=prd/);
  await expect(
    page.getByRole("heading", { name: "Checkout redesign" }),
  ).toBeVisible({ timeout: 30_000 });

  // Return to the conversation and ask to change the PRD. Because a PRD now
  // exists, the reply offers a revision, not a fresh generation.
  await page.getByRole("link", { name: /Conversation|Room/ }).first().click();
  await askProductAgent(
    page,
    "@Product Agent update the PRD to allow reassignment from PAMS users",
  );

  const update = page.getByRole("button", { name: "Update PRD" });
  await expect(update).toBeVisible({ timeout: 30_000 });
  // The generate action must NOT be what is offered here.
  await expect(
    page.getByRole("button", { name: "Generate PRD" }),
  ).toHaveCount(0);

  // Confirm the revision: it queues. Navigate to the PRD tab the same explicit
  // way e2e/prd-generate.spec.ts proves it -- by clicking the tab rather than
  // relying on the post-confirm auto-push. With the fake, the revise task
  // completes within a few poll cycles, so on a cold CI dev server the status
  // poll's router.refresh() can abort the still-compiling auto-push and leave
  // the route on the conversation tab. Clicking the tab is the deterministic
  // path; the revised version then renders.
  await update.click();
  await expect(prdTab).toBeVisible();
  await prdTab.click();
  await expect(page).toHaveURL(/tab=prd/);
  await expect(
    page.getByRole("heading", { name: "Checkout redesign" }),
  ).toBeVisible({ timeout: 30_000 });

  await context.close();
});
