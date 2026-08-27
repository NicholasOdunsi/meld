import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// The origin cookies are pinned to. Derived from `MELD_E2E_PORT` exactly as
// `playwright.config.ts` derives `baseURL`: hardcoding port 3000 here silently
// unauthenticates every spec in this file whenever the suite is run on another
// port, which looks like a redirect-to-sign-in regression rather than a
// misconfiguration.
const APPLICATION_ORIGIN = `http://127.0.0.1:${
  process.env.MELD_E2E_PORT ?? 3000
}`;

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
    { name: "meld-e2e-user-name", value: user.name, url: APPLICATION_ORIGIN },
  ]);
}

async function createWorkspace(
  page: Page,
  input: { name: string; logoFileName: string },
) {
  await page
    .getByRole("textbox", { name: /workspace name/i })
    .fill(input.name);
  await page.locator('input[type="file"]').setInputFiles({
    name: input.logoFileName,
    mimeType: "image/png",
    buffer: Buffer.from(`${input.name} logo`),
  });
  await page.getByRole("button", { name: "Create workspace" }).click();

  await expect(
    page.getByRole("heading", { name: "Invite your team.", exact: true }),
  ).toBeVisible();
  const workspaceId = new URL(page.url()).pathname.split("/")[2];

  await page.getByRole("button", { name: "Skip for now" }).click();

  // The managed-AI connection step now sits between invitations and setup.
  await expect(
    page.getByRole("heading", { name: "Connect your AI.", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Set up later" }).click();

  // See `onboarding.spec.ts`: the setup step renders `null` now, its visual
  // having moved into `WorkspaceRevealProvider`. Landing on the workspace is
  // the signal.
  await expect(page).toHaveURL(new RegExp(`/${workspaceId}$`), {
    timeout: 15_000,
  });

  return workspaceId;
}

// The workspace root is the deck now, and the deck renders without navigation
// -- so the rail this spec is about is not on it. Settings is a workspace
// route that still carries the sidebar shell.
function workspaceShellRoute(workspaceId: string) {
  return `/${workspaceId}/settings/members`;
}

test("switches between workspaces from the rail", async ({ browser }) => {
  const context = await browser.newContext();
  await authenticateContext(context, {
    id: "70000000-0000-4000-8000-000000000007",
    email: "switcher@example.com",
    name: "Switcher Example",
  });
  const page = await context.newPage();

  await page.goto("/onboarding");
  const firstWorkspaceId = await createWorkspace(page, {
    name: "Northstar",
    logoFileName: "northstar.png",
  });

  await page.goto(workspaceShellRoute(firstWorkspaceId));
  const workspaceRail = page.getByTestId("workspace-rail");
  await expect(
    workspaceRail.getByRole("link", { name: "Northstar" }),
  ).toHaveAttribute("aria-current", "page");

  const createWorkspaceLink = workspaceRail.getByRole("link", {
    name: "Create workspace",
  });
  await expect(createWorkspaceLink).toHaveAttribute("href", "/onboarding");
  await createWorkspaceLink.click();
  await expect(page).toHaveURL(/\/onboarding$/);
  const secondWorkspaceId = await createWorkspace(page, {
    name: "Basecamp",
    logoFileName: "basecamp.png",
  });
  expect(secondWorkspaceId).not.toBe(firstWorkspaceId);

  await page.goto(workspaceShellRoute(secondWorkspaceId));
  const workspaceLinks = workspaceRail.getByRole("link", {
    name: /Northstar|Basecamp/,
  });
  await expect(workspaceLinks).toHaveCount(2);
  const firstWorkspaceLink = workspaceLinks.nth(0);
  const secondWorkspaceLink = workspaceLinks.nth(1);
  await expect(firstWorkspaceLink).toHaveAccessibleName("Northstar");
  await expect(secondWorkspaceLink).toHaveAccessibleName("Basecamp");
  await expect(secondWorkspaceLink).toHaveAttribute("aria-current", "page");
  await expect(firstWorkspaceLink).not.toHaveAttribute("aria-current");

  await firstWorkspaceLink.hover();
  await expect(page.getByRole("tooltip")).toHaveText("Northstar");

  // The rail points at each workspace's landing surface, which is the deck.
  // Switching therefore leaves the sidebar behind -- so the switch itself is
  // proven on the deck, by the workspace it names.
  await firstWorkspaceLink.click();
  await expect(page).toHaveURL(new RegExp(`/${firstWorkspaceId}$`));
  await expect(page.getByTestId("deck-frame")).toContainText("Northstar");

  // ...and the rail's own state is then checked back on a route that has one.
  await page.goto(workspaceShellRoute(firstWorkspaceId));
  await expect(
    workspaceRail.getByRole("link", { name: "Northstar" }),
  ).toHaveAttribute("aria-current", "page");
  await expect(
    workspaceRail.getByRole("link", { name: "Basecamp" }),
  ).not.toHaveAttribute("aria-current");

  await context.close();
});
