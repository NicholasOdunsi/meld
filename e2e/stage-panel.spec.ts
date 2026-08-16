import { expect, test, type BrowserContext } from "@playwright/test";

// Drives the stage-coaching panel through the browser against the seeded fake
// fixtures: the collapsed pill, the expanded checklist, and the move control.

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const EMPTY_ROOM_ID = "40000000-0000-4000-8000-000000000002";

const OWNER = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
  name: "Owner Example",
};

async function authenticate(context: BrowserContext, origin: string) {
  await context.addCookies([
    { name: "meld-e2e-user-id", value: OWNER.id, url: origin },
    { name: "meld-e2e-user-email", value: OWNER.email, url: origin },
    { name: "meld-e2e-user-name", value: OWNER.name, url: origin },
  ]);
}

function requireBaseURL(baseURL: string | undefined): string {
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required.");
  }
  return baseURL;
}

test("the stage panel expands from its pill and offers the next move", async ({
  browser,
  baseURL,
}) => {
  const origin = requireBaseURL(baseURL);
  const context = await browser.newContext({ baseURL: origin });
  await authenticate(context, origin);
  const page = await context.newPage();
  await page.goto(`/${WORKSPACE_ID}/rooms/${EMPTY_ROOM_ID}?tab=conversation`);

  const pill = page.getByTestId("stage-coaching-pill");
  await expect(pill).toBeVisible();
  // A fresh room starts in Discovery with nothing confirmed.
  await expect(pill).toContainText("Discovery");

  // The panel opens by default under the header — no click needed.
  const panel = page.getByTestId("stage-coaching-panel");
  await expect(panel).toBeVisible();
  await expect(panel.getByText("Brainstorming started")).toBeVisible();
  await expect(panel.getByText("Problem framed")).toBeVisible();
  await expect(
    panel.getByRole("button", { name: /Move to Define/ }),
  ).toBeVisible();

  await context.close();
});
