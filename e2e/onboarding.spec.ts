import { createHmac } from "node:crypto";
import {
  expect,
  test,
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

async function selectProductRole(page: Page, role: string) {
  await page.getByRole("combobox", { name: "Role" }).click();
  await page.getByRole("option", { name: role, exact: true }).click();
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

test("creates a workspace and accepts an invitation in a second browser context", async ({
  browser,
}) => {
  const adminContext = await browser.newContext();
  await authenticateContext(adminContext, {
    id: "10000000-0000-4000-8000-000000000001",
    email: "owner@example.com",
    name: "Owner Example",
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
    .getByRole("textbox", { name: /email address/i })
    .fill("invitee@example.com");
  await selectProductRole(adminPage, "Product manager");
  await adminPage
    .getByRole("button", { name: "Send invite" })
    .click();

  await expect(adminPage).toHaveURL(
    `/onboarding/${organizationId}/members`,
  );
  await expect(
    adminPage.getByText("invitee@example.com", { exact: true }),
  ).toBeVisible();
  await adminPage
    .getByRole("button", { name: "Skip for now" })
    .click();
  await expect(
    adminPage.getByRole("heading", {
      name: "Setting up your workspace.",
      exact: true,
    }),
  ).toBeVisible();
  await expect(
    adminPage.getByText(/Invite your team into Discovery Rooms/),
  ).toBeVisible();
  await expect(
    adminPage.getByRole("heading", {
      name: "Discovery Rooms",
      exact: true,
      level: 1,
    }),
  ).toBeVisible({ timeout: 15_000 });

  await adminPage.goto(`/${organizationId}/settings/members`);
  const invitationRow = adminPage
    .getByRole("row")
    .filter({ hasText: "invitee@example.com" });
  await expect(invitationRow).toContainText("Invited");
  const invitationId = await invitationRow
    .locator('input[name="invitationId"]')
    .inputValue();
  const invitationToken = deriveInvitationToken(invitationId);

  const replacementEmail = "replacement@example.com";
  await adminPage
    .getByRole("textbox", { name: /email address/i })
    .fill(replacementEmail);
  await selectProductRole(adminPage, "Product manager");
  await adminPage
    .getByRole("button", { name: "Send invite" })
    .click();

  const replacementRows = adminPage
    .getByRole("row")
    .filter({ hasText: replacementEmail });
  await expect(replacementRows).toHaveCount(1);
  const originalReplacementId = await replacementRows
    .locator('input[name="invitationId"]')
    .inputValue();

  await adminPage
    .getByRole("textbox", { name: /email address/i })
    .fill(replacementEmail);
  await selectProductRole(adminPage, "Product manager");
  await adminPage
    .getByRole("button", { name: "Send invite" })
    .click();
  await expect(
    adminPage.getByText(
      "An active invitation already exists; revoke it before creating another",
    ),
  ).toBeVisible();
  await expect(replacementRows).toHaveCount(1);

  adminPage.once("dialog", (dialog) => dialog.accept());
  await replacementRows
    .getByRole("button", { name: "Revoke" })
    .click();
  await expect(replacementRows).toContainText("Revoked");

  await adminPage
    .getByRole("textbox", { name: /email address/i })
    .fill(replacementEmail);
  await selectProductRole(adminPage, "Product manager");
  await adminPage
    .getByRole("button", { name: "Send invite" })
    .click();
  await expect(replacementRows).toHaveCount(2);
  const freshReplacementId = await replacementRows
    .filter({ hasText: "Invited" })
    .locator('input[name="invitationId"]')
    .inputValue();
  expect(freshReplacementId).not.toBe(originalReplacementId);

  const inviteeContext = await browser.newContext();
  await authenticateContext(inviteeContext, {
    id: "30000000-0000-4000-8000-000000000003",
    email: "invitee@example.com",
    name: "Invitee Example",
  });
  const inviteePage = await inviteeContext.newPage();

  await inviteePage.goto(`/invitations/${invitationToken}`);
  await inviteePage
    .getByRole("button", { name: "Accept invitation" })
    .click();
  await expect(inviteePage.getByText("You joined Northstar.")).toBeVisible();
  await inviteePage
    .getByRole("link", { name: "Open workspace members" })
    .click();

  await expect(inviteePage).toHaveURL(
    `/${organizationId}/settings/members`,
  );
  await expect(
    inviteePage
      .getByRole("row")
      .filter({ hasText: "invitee@example.com" })
      .filter({ hasText: "Active" }),
  ).toBeVisible();

  await inviteeContext.close();
  await adminContext.close();
});
