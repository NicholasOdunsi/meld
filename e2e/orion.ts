import { expect, type Page } from "@playwright/test";

// The web shell now draws OrionSidebar (flat project links + "New chat tab"),
// not the old WorkspaceNavigation accordion. Shared helpers keep every spec on
// that path so they do not sit for 120s waiting for a button that no longer exists.

export async function settleOrion(page: Page) {
  await page.getByTestId("orion-sidebar").waitFor();
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="orion-sidebar"]');
    return (
      node !== null &&
      Object.keys(node).some((key) => key.startsWith("__reactFiber$"))
    );
  });
}

export async function open(page: Page, path: string) {
  await page.goto(path);
  await settleOrion(page);
}

/** Open a project by its sidebar link (lands on Main / first chat). */
export async function openProject(page: Page, projectName: string) {
  await settleOrion(page);
  // The options IconButton lives inside the link; a raw click often hits that
  // and never navigates. Go via the href instead.
  const href = await page
    .getByTestId("orion-sidebar")
    .getByRole("link", { name: new RegExp(`^${escapeRegExp(projectName)}`) })
    .getAttribute("href");
  if (!href) {
    throw new Error(`No sidebar href for project “${projectName}”.`);
  }
  await page.goto(href);
  await settleOrion(page);
}

/**
 * After onboarding (or on a workspace that already has "Untitled project"):
 * open its Main chat. openProject creates Main when the project has no chats.
 */
export async function openUntitledMain(page: Page) {
  await openProject(page, "Untitled project");
  await expect(
    page.getByTestId("room-header").getByRole("heading", { name: "Main" }),
  ).toBeVisible({ timeout: 15_000 });
}

/** Open Untitled → Main, then add a "New chat" tab. */
export async function openUntitledNewChat(page: Page) {
  await openUntitledMain(page);
  await page.getByRole("button", { name: "New chat tab" }).click();
  await expect(
    page.getByTestId("room-header").getByRole("heading", { name: "New chat" }),
  ).toBeVisible({ timeout: 15_000 });
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
