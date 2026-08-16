import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

// The full natural-language flow the room owner actually walks:
//   ask the Product Agent for a PRD -> the reply proposes generation ->
//   confirm -> the PRD tab appears and shows the generating state ->
//   the materialized document renders in the tab.
//
// This is the one place that proof crosses every real boundary at once (the
// RSC page, the "use client" Conversation and RoomTaskStatusProvider, the
// server action, and the polling projection). The seeded-PRD view path and the
// task-state recovery banners are proven elsewhere:
//   - a room that already has a PRD renders it ............. e2e/prd-view.spec.ts
//   - failed / needs_review / usage-limit recovery banners  web unit
//         apps/web/src/features/ai/components/agent-task-state.test.tsx
//   - generation idempotency (one active task per room) .... pgTAP
//         supabase/tests/create_prd_generate_task.test.sql

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

// Create a workspace and one fresh Room (which starts with no PRD),
// returning the room URL.
async function createRoom(page: Page): Promise<string> {
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
  return page.url();
}

test("ask → confirm → generate → the PRD tab renders the document", async ({
  browser,
  baseURL,
}) => {
  if (!baseURL) throw new Error("Playwright baseURL is required for PRD E2E.");
  const context = await browser.newContext();
  await authenticateContext(context, baseURL, OWNER);
  const page = await context.newPage();

  await createRoom(page);

  // A room with no PRD and no active generation exposes no PRD tab.
  await expect(page.getByRole("link", { name: /^PRD/ })).toHaveCount(0);

  // Ask the Product Agent to make a PRD; the reply proposes generation.
  await page
    .getByRole("combobox", { name: "Message" })
    .fill("@Product Agent make a PRD from this room");
  // Route to Codex by picking its model from the composer's provider chip.
  await page.getByTestId("agent-provider-picker").click();
  await page.getByRole("menuitemradio", { name: "GPT-5.5" }).click();
  await page.getByRole("button", { name: "Send" }).click();

  // The proposal chip appears on the settled reply.
  const generate = page.getByRole("button", { name: "Generate PRD" });
  await expect(generate).toBeVisible({ timeout: 30_000 });

  // Confirm generation: the PRD tab appears and the route switches to it.
  await generate.click();
  const prdTab = page.getByRole("link", { name: /^PRD/ });
  await expect(prdTab).toBeVisible();

  // View the PRD tab: the generating state shows first, then the materialized
  // document replaces it once generation completes.
  await prdTab.click();
  await expect(page).toHaveURL(/tab=prd/);
  await expect(page.getByTestId("agent-activity")).toContainText(
    "Drafting your PRD",
  );

  // The materialized document replaces the generating view.
  await expect(
    page.getByRole("heading", { name: "Checkout redesign" }),
  ).toBeVisible({ timeout: 30_000 });
  await expect(
    page.getByRole("heading", { name: "Executive summary" }),
  ).toBeVisible();

  await context.close();
});
