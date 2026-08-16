import { expect, test } from "@playwright/test";

// Fixtures from apps/web/src/features/rooms/e2e-fake.ts (E2E_WORKSPACE_ID /
// E2E_DESIGN_ROOM_ID): a Room already in the Design stage, landed on its
// default Conversation surface (no ?tab), with the owner holding edit access
// -- everything the Figma lane needs (posting, the card's own refresh, and
// remove all require an editor) with nothing extra to seed.
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000005";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";

// A normalized-shape Figma /design/ URL (host allowed, node-id kept, no other
// query survives normalizeFigmaUrl) embedded in an otherwise ordinary
// message body -- proving detection runs against a real conversation post,
// not a hand-built fixture row.
const FIGMA_URL =
  "https://www.figma.com/design/abc123DEF456ghi789JKL0/Sample-File?node-id=1-2&t=xyz";
const MESSAGE_BODY = `Here are the mockups: ${FIGMA_URL} let me know what you think.`;

test.beforeEach(async ({ context }, testInfo) => {
  const applicationOrigin = testInfo.project.use.baseURL;
  if (typeof applicationOrigin !== "string") {
    throw new Error(
      "Playwright baseURL is required for design-figma-lane E2E auth.",
    );
  }

  await context.addCookies([
    { name: "meld-e2e-user-id", value: OWNER_ID, url: applicationOrigin },
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

test("posting a Figma link unfurls to a cached thumbnail card, then removes", async ({
  page,
}) => {
  await page.goto(`/${WORKSPACE_ID}/rooms/${ROOM_ID}`);

  await expect(
    page.getByRole("combobox", { name: "Message" }),
  ).toBeVisible();
  await page.getByRole("combobox", { name: "Message" }).fill(MESSAGE_BODY);
  await page.getByRole("button", { name: "Send" }).click();

  // The human message persists first, unconditionally.
  await expect(page.getByText("Here are the mockups:").first()).toBeVisible();

  // Detection on post (recordFigmaReferences, fire-and-forget from
  // postMessage) lands a "pending" reference row, and the conversation's own
  // client refetch picks it up as a plain link card.
  await expect(page.getByTestId("figma-card-pending")).toBeVisible();

  // The editor's one-shot lazy refresh (FigmaReferenceCard's own mount
  // effect, gated on edit access) flips it to the cached thumbnail card. The
  // pending card is gone once the "ok" one has replaced it.
  await expect(page.getByTestId("figma-card-ok")).toBeVisible({
    timeout: 15_000,
  });
  await expect(page.getByTestId("figma-card-pending")).toHaveCount(0);

  // Removing it (editor-only) clears the card entirely -- no link, thumbnail,
  // or failed state left behind.
  await page.getByTestId("figma-card-remove").click();
  await expect(page.getByTestId("figma-card-ok")).toHaveCount(0);
  await expect(page.getByTestId("figma-card-pending")).toHaveCount(0);
  await expect(page.getByTestId("figma-card-failed")).toHaveCount(0);
});
