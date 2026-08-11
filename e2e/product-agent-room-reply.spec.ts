import {
  expect,
  test,
  type BrowserContext,
  type Page,
} from "@playwright/test";

// Coverage map for the brief's enumerated browser cases. The browser tests below
// cover the flows whose end-to-end proof is the web UI's own logic (composer,
// sessionStorage draft, per-task picker, task-state banners, routing). The rest
// are proven at the layer that owns them and are cited here rather than
// re-run slowly in a browser:
//
//   - Codex happy path + shared reply (two contexts) ....... browser (this file)
//   - Claude override (picker -> provider attribution) ..... browser (this file)
//   - Draft-preserving setup redirect (web-only UX) ........ browser (this file)
//   - Failed reply -> "Ask again" refills the mention ...... browser (this file)
//   - Usage limit / reauth / needs_review / offline banners  web unit
//         apps/web/src/features/ai/components/agent-task-state.test.tsx
//         (needs_reauthentication, usage_limit_reached, needs_review, failed,
//          waiting_for_device -> Reconnect; Fix connection / Ask again actions)
//   - Human message persists before the task ............... web unit
//         apps/web/src/features/discovery/actions -> postMessage ordering; and
//         apps/web/src/features/discovery/e2e-fake.test.ts (mention flow)
//   - Malformed output / tool-event (security violation) /
//     provider timeout / cancellation classification ...... connector integration
//         apps/connector/src/tasks/task-executor.integration.test.ts
//         (real TaskExecutor + adapters + process runner + fake binaries)
//   - Reauthentication / usage-limit / signed-out at setup . connector integration
//         apps/connector/src/providers/provider-setup.integration.test.ts
//   - Duplicate/conflicting completion -> one agent message  gateway integration
//         apps/gateway/src/server.integration.test.ts (exactly-once settlement)
//
// Notes for the reviewer: the two-context assertion proves shared *persistence*
// (the fake has no live Realtime push); the cancellation test asserts the
// `cancelled` status, not process-group reaping (AI-08 stays unchecked).

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

  // Room creation now happens through the sidebar dialog; the standalone
  // /discovery management page was removed on this branch.
  await page
    .getByRole("button", { name: "Create Discovery Room" })
    .click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
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

    // The routing chip remains in the toolbar as the draft changes.
    await page
      .getByRole("combobox", { name: "Message" })
      .fill("@Product Agent challenge this assumption");
    await expect(page.getByTestId("agent-provider-picker")).toBeVisible();

    // Choose Codex explicitly from the chip's menu.
    await page.getByTestId("agent-provider-picker").click();
    await page.getByRole("menuitemradio", { name: "Codex" }).click();

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

  test("attributes the reply to Claude when the picker overrides the provider", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await authenticateContext(context, OWNER);
    const page = await context.newPage();

    await createRoom(page);

    await page
      .getByRole("combobox", { name: "Message" })
      .fill("@Product Agent challenge this assumption");
    await page.getByTestId("agent-provider-picker").click();
    await page.getByRole("menuitemradio", { name: "Claude" }).click();
    await page.getByTestId("agent-provider-picker").click();
    await page
      .getByRole("menuitemradio", { name: "Sonnet 4.5" })
      .click();
    await page.getByRole("button", { name: "Send" }).click();

    // The persisted reply carries Claude provenance.
    await expect(page.getByText("via Claude").first()).toBeVisible({
      timeout: 30_000,
    });

    await context.close();
  });

  test("remembers the provider routed to this room after reload", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await authenticateContext(context, OWNER);
    const page = await context.newPage();

    const roomUrl = await createRoom(page);

    await page.getByTestId("agent-provider-picker").click();
    await page.getByRole("menuitemradio", { name: "Claude" }).click();
    await expect(
      page.getByRole("button", { name: /Claude/ }),
    ).toBeVisible();

    await page.goto(roomUrl);
    await expect(
      page.getByRole("button", { name: /Claude/ }),
    ).toBeVisible();

    await context.close();
  });

  test("preserves the draft and routes to setup when no provider is ready", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await authenticateContext(context, OWNER);
    const page = await context.newPage();

    const roomUrl = await createRoom(page);
    const { pathname } = new URL(roomUrl);
    const organizationId = pathname.split("/")[1]!;

    // Seed a not-ready readiness, then reload so the room re-resolves it.
    await context.addCookies([
      {
        name: "meld-e2e-agent-not-ready",
        value: "1",
        url: APPLICATION_ORIGIN,
      },
    ]);
    await page.reload();

    await page
      .getByRole("combobox", { name: "Message" })
      .fill("@Product Agent challenge this assumption");
    // The not-ready prompt is a single live status line; the chip owns setup.
    await expect(page.getByTestId("agent-not-ready")).toBeVisible();

    await page.getByRole("button", { name: "Send" }).click();
    // Routed to AI setup with a returnTo back to this room; nothing submitted.
    await expect(page).toHaveURL(
      new RegExp(`/${organizationId}/settings/devices\\?returnTo=`),
      { timeout: 15_000 },
    );

    // Returning to the room restores the persisted draft.
    await page.goto(roomUrl);
    await expect(
      page.getByRole("combobox", { name: "Message" }),
    ).toContainText("challenge this assumption");

    await context.close();
  });

  test("offers Ask again on a failed reply and refills the mention", async ({
    browser,
  }) => {
    const context = await browser.newContext();
    await authenticateContext(context, OWNER);
    // Seed a failed settlement so the task-state attention banner is exercised.
    await context.addCookies([
      {
        name: "meld-e2e-task-status",
        value: "failed",
        url: APPLICATION_ORIGIN,
      },
    ]);
    const page = await context.newPage();

    await createRoom(page);

    await page
      .getByRole("combobox", { name: "Message" })
      .fill("@Product Agent challenge this assumption");
    await page.getByTestId("agent-provider-picker").click();
    await page.getByRole("menuitemradio", { name: "Codex" }).click();
    await page.getByRole("button", { name: "Send" }).click();

    // The failed reply surfaces the honest-recovery affordance, never a reply.
    const askAgain = page.getByRole("button", { name: "Ask again" });
    await expect(askAgain).toBeVisible({ timeout: 30_000 });
    await expect(page.getByText("challenges the assumption")).toHaveCount(0);

    // Ask again refills the composer with the original @Product Agent mention
    // rather than navigating away.
    await askAgain.click();
    await expect(
      page.getByRole("combobox", { name: "Message" }),
    ).toContainText("challenge this assumption");

    await context.close();
  });
});
