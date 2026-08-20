import { expect, test, type BrowserContext, type Page } from "@playwright/test";

// The seeded owner and their default workspace, mirrored from
// `workspaces/e2e-fake.ts` / `rooms/e2e-fake.ts` by value rather than by
// import -- the same choice `workspace-project-navigation.spec.ts` makes, so
// each spec file pins the fake's contract independently instead of sharing a
// fixture module.
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const OWNER = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
  name: "Owner Example",
};

// The second project of the seeded workspace and its one room. Its tile is
// the navigation target: it carries exactly one room, so which room the tile
// opens is unambiguous (the first project carries many rooms shared with
// other specs, whose insertion order the tile's "most recent" choice would
// otherwise depend on).
const SECOND_PROJECT_NAME = "Meld E2E growth";
const SECOND_PROJECT_ROOM_ID = "40000000-0000-4000-8000-000000000003";
const SECOND_PROJECT_ROOM_NAME = "Pricing rework";

// `onboarding.spec.ts` already asserts the deck frame, the ticket, the
// project name, both top-strip links and the absence of the sidebar on the
// post-onboarding landing -- this file covers what that one does not:
// keyboard focus, a tile's navigation, and a roomless tile's non-navigation.

async function authenticate(context: BrowserContext, applicationOrigin: string) {
  await context.addCookies([
    { name: "meld-e2e-user-id", value: OWNER.id, url: applicationOrigin },
    { name: "meld-e2e-user-email", value: OWNER.email, url: applicationOrigin },
    { name: "meld-e2e-user-name", value: OWNER.name, url: applicationOrigin },
  ]);
}

function requireBaseURL(baseURL: string | undefined): string {
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for navigation E2E.");
  }
  return baseURL;
}

// Under `next dev` the server HTML arrives well before the bundle that brings
// it to life, so a keypress or click in that window is simply lost. Mirrors
// `workspace-project-navigation.spec.ts`'s `open()`, retargeted at the deck's
// own frame since the deck renders with no sidebar to wait on instead.
async function openDeck(page: Page) {
  await page.goto(`/${WORKSPACE_ID}`);
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="deck-frame"]');
    return (
      node !== null &&
      Object.keys(node).some((key) => key.startsWith("__reactFiber$"))
    );
  });
}

test.beforeEach(async ({ context }, testInfo) => {
  await authenticate(context, requireBaseURL(testInfo.project.use.baseURL));
});

test("command-K focuses the deck prompt", async ({ page }) => {
  await openDeck(page);

  // `deck-shortcuts.tsx` accepts either `metaKey` or `ctrlKey`, so
  // Playwright's `ControlOrMeta` modifier -- which resolves off the host
  // platform -- exercises the shortcut correctly everywhere it runs.
  await page.keyboard.press("ControlOrMeta+k");

  await expect(page.locator("#deck-prompt")).toBeFocused();
});

test("a project tile navigates to its most recently active room, and the deck is gone", async ({
  page,
}) => {
  await openDeck(page);

  await page.getByRole("link", { name: SECOND_PROJECT_NAME }).click();

  await expect(page).toHaveURL(
    new RegExp(`/${WORKSPACE_ID}/rooms/${SECOND_PROJECT_ROOM_ID}$`),
  );
  await expect(
    page
      .getByTestId("room-header")
      .getByRole("heading", { name: SECOND_PROJECT_ROOM_NAME }),
  ).toBeVisible();
  // No project page exists yet, so the tile opens a Room directly -- and the
  // deck, which renders with no sidebar, is left behind entirely.
  await expect(page.getByTestId("deck-frame")).toHaveCount(0);
});

test("a project with no rooms renders a tile that is not a link", async ({
  page,
}) => {
  await openDeck(page);

  // The deck's own "+ new project" control (`ProjectColumn`), not the
  // sidebar's -- the deck has no sidebar to open one from. A workspace has no
  // route that creates a project without also seeding a room, so a fresh one
  // is created here to get a tile with zero rooms to assert against.
  await page.getByRole("button", { name: "+ new project" }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Deck e2e roomless project");
  await dialog.getByRole("button", { name: "Create project" }).click();
  await expect(dialog).toHaveCount(0);

  // The tile renders -- the project is real -- but `project-column.tsx` keys
  // a roomless project's tile with `Fragment` rather than `Link`, because
  // linking it would point at a Room that does not exist and 404. This is
  // the case most worth pinning: it is the one bad wiring would break loudest.
  await expect(page.getByText("Deck e2e roomless project")).toBeVisible();
  await expect(
    page.getByRole("link", { name: "Deck e2e roomless project" }),
  ).toHaveCount(0);
});
