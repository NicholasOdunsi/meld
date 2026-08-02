import { createHmac } from "node:crypto";
import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

const APPLICATION_ORIGIN = "http://127.0.0.1:3000";
const INVITATION_TOKEN_SECRET =
  "6Lr5Xn3p2QVv8qFsa0RMXKFF23alHmmad4FUwx_JQDU";
const INVITATION_TOKEN_CONTEXT = "meld/invitation-token/v1";

function deriveInvitationToken(invitationId: string) {
  return createHmac(
    "sha256",
    Buffer.from(INVITATION_TOKEN_SECRET, "base64url"),
  )
    .update(INVITATION_TOKEN_CONTEXT)
    .update("\0")
    .update(invitationId)
    .digest("base64url");
}

async function authenticateContext(
  context: BrowserContext,
  user: { id: string; email: string; name: string },
) {
  await context.addCookies([
    {
      name: "meld-e2e-user-id",
      value: user.id,
      url: APPLICATION_ORIGIN,
    },
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

async function selectProductRole(page: Page, role: string) {
  await page.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: role, exact: true }).click();
}

async function inviteAndAccept(input: {
  adminPage: Page;
  organizationId: string;
  browser: Browser;
  user: { id: string; email: string; name: string };
}) {
  await input.adminPage.goto(
    `/${input.organizationId}/settings/members`,
  );
  await input.adminPage
    .getByRole("textbox", { name: /email address/i })
    .fill(input.user.email);
  await selectProductRole(input.adminPage, "Product manager");
  await input.adminPage
    .getByRole("button", { name: "Send invite" })
    .click();
  const row = input.adminPage
    .getByRole("row")
    .filter({ hasText: input.user.email })
    .filter({ hasText: "Invited" });
  await expect(row).toBeVisible();
  const invitationId = await row
    .locator('input[name="invitationId"]')
    .inputValue();

  const context = await input.browser.newContext();
  await authenticateContext(context, input.user);
  const page = await context.newPage();
  await page.goto(
    `/invitations/${deriveInvitationToken(invitationId)}`,
  );
  await page
    .getByRole("button", { name: "Accept invitation" })
    .click();
  // Accepting redirects straight to the workspace home. The success banner is
  // rendered but immediately replaced, so the URL is the stable signal.
  await expect(page).toHaveURL(
    new RegExp(`/${input.organizationId}$`),
  );
  return { context, page };
}

// Scope note: this used to add a second person to the room and exchange
// messages between them. The Discovery Room header redesign deliberately
// retired that interface — see
// docs/design/specs/2026-07-25-discovery-room-header-and-participants-design.md
// ("The roster is informational in this pass"), which removed the right
// inspector while keeping the participant actions in the codebase. There is
// currently no way for a user to add a room participant, so the browser cannot
// exercise it. Participant-level authorization is asserted instead against RLS
// in supabase/tests/discovery_access.test.sql, which is the stronger layer.
test("a room owner posts messages while an unrelated organization member is denied access", async ({
  browser,
}) => {
  const adminContext = await browser.newContext();
  await authenticateContext(adminContext, {
    id: "51000000-0000-4000-8000-000000000001",
    email: "room-owner@example.com",
    name: "Room Owner",
  });
  const adminPage = await adminContext.newPage();

  await adminPage.goto("/onboarding");
  await adminPage
    .getByRole("textbox", { name: /organization name/i })
    .fill("Northstar");
  await adminPage.locator('input[type="file"]').setInputFiles({
    name: "northstar.png",
    mimeType: "image/png",
    buffer: Buffer.from("organization logo"),
  });
  await adminPage
    .getByRole("button", { name: "Create workspace" })
    .click();
  await expect(
    adminPage.getByRole("heading", {
      name: "Invite your team.",
      exact: true,
    }),
  ).toBeVisible();
  const organizationId =
    new URL(adminPage.url()).pathname.split("/")[2];
  await adminPage
    .getByRole("button", { name: "Skip for now" })
    .click();
  // Invite skip now lands on the managed-AI connection step; defer it.
  await adminPage
    .getByRole("button", { name: "Set up later" })
    .click();
  await expect(adminPage).toHaveURL(
    new RegExp(`/${organizationId}$`),
    { timeout: 15_000 },
  );

  // Room creation now happens through the sidebar dialog; the standalone
  // /discovery management page was removed on this branch.
  await adminPage
    .getByRole("button", { name: "Create Discovery Room" })
    .click();
  await adminPage
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Customer discovery");
  await adminPage
    .getByRole("button", { name: "Create room" })
    .click();
  await expect(
    adminPage.getByRole("heading", {
      name: "Customer discovery",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    adminPage
      .getByTestId("dashboard-side-nav")
      .getByRole("link", { name: "Customer discovery" }),
  ).toBeVisible();
  const roomId = new URL(adminPage.url()).pathname.split("/").at(-1)!;

  // The composer input carries a mention trigger, so it exposes the combobox
  // role in a real browser even though jsdom resolves it as a textbox.
  await adminPage
    .getByRole("combobox", { name: "Message" })
    .fill("Customer interviews disagree");
  await adminPage.getByRole("button", { name: "Send" }).click();
  await expect(
    adminPage.getByText("Customer interviews disagree"),
  ).toBeVisible();

  const unrelated = await inviteAndAccept({
    adminPage,
    organizationId,
    browser,
    user: {
      id: "51000000-0000-4000-8000-000000000003",
      email: "unrelated@example.com",
      name: "Unrelated Member",
    },
  });
  await unrelated.page.goto(`/${organizationId}/discovery`);
  await expect(
    unrelated.page.getByRole("link", { name: "Customer discovery" }),
  ).toHaveCount(0);
  await unrelated.page.goto(`/${organizationId}/discovery/${roomId}`);
  await expect(unrelated.page).toHaveURL(
    new RegExp(`/${organizationId}$`),
  );
  await expect(
    unrelated.page.getByText("Customer interviews disagree"),
  ).toHaveCount(0);

  await unrelated.context.close();
  await adminContext.close();
});
