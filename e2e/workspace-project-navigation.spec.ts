import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

// Projects are navigation, not containers: exactly one is open at a time, the
// open one follows the Room you are in, and administering them is an admin's
// job. A workspace shows its own Projects and Rooms and nobody else's, and the
// rail is allowed to say only that another workspace is waiting on you.

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const PARTNER_WORKSPACE_ID = "00000000-0000-4000-8000-000000000002";
const PRD_ROOM_ID = "40000000-0000-4000-8000-000000000003";

const SECOND_PROJECT_ID = "20000000-0000-4000-8000-000000000002";
const PARTNER_PROJECT_ID = "20000000-0000-4000-8000-000000000003";

const WORKSPACE_NAME = "Meld E2E";
const PARTNER_WORKSPACE_NAME = "Meld E2E partners";
const FIRST_PROJECT_NAME = "Meld E2E product";
const SECOND_PROJECT_NAME = "Meld E2E growth";
const PARTNER_PROJECT_NAME = "Partner integrations";

const OWNER = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
  name: "Owner Example",
};
const MEMBER = {
  id: "10000000-0000-4000-8000-000000000002",
  email: "teammate@example.com",
  name: "Teammate Example",
};

type FixtureUser = typeof OWNER;

async function authenticate(
  context: BrowserContext,
  user: FixtureUser,
  applicationOrigin: string,
) {
  await context.addCookies([
    { name: "meld-e2e-user-id", value: user.id, url: applicationOrigin },
    {
      name: "meld-e2e-user-email",
      value: user.email,
      url: applicationOrigin,
    },
    { name: "meld-e2e-user-name", value: user.name, url: applicationOrigin },
  ]);
}

async function openAs(
  browser: Browser,
  user: FixtureUser,
  applicationOrigin: string,
): Promise<{ context: BrowserContext; page: Page }> {
  const context = await browser.newContext({ baseURL: applicationOrigin });
  await authenticate(context, user, applicationOrigin);
  return { context, page: await context.newPage() };
}

function requireBaseURL(baseURL: string | undefined): string {
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for navigation E2E.");
  }
  return baseURL;
}

// The accordion trigger. Exact, because every per-Project action -- add room,
// rename, delete -- also carries the Project's name.
function projectAccordion(page: Page, name: string) {
  return page.getByRole("button", { name, exact: true });
}

// Opening a workspace "plainly": on a route that carries the sidebar, with no
// Room active.
//
// The workspace root is the deck now, and the deck deliberately renders
// without navigation -- so every assertion in this file, which is entirely
// about the sidebar, has to enter the workspace somewhere else. Settings
// rather than a Room on purpose: a Room decides which Project is open, and
// that is the exact behaviour three of these tests measure.
function workspaceShellRoute(workspaceId: string) {
  return `/${workspaceId}/settings/members`;
}

// Under `next dev` the server HTML arrives well before the bundle that brings
// it to life, and a click in that window is simply lost: a <button> with no
// listener yet does nothing at all. React attaches a fiber to every host node
// it hydrates, so the presence of one on a node deep in the tree is the signal
// that the page is actually interactive rather than merely painted.
async function open(page: Page, path: string) {
  await page.goto(path);
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="workspace-navigation"]');
    return (
      node !== null &&
      Object.keys(node).some((key) => key.startsWith("__reactFiber$"))
    );
  });
}

// No retries: the webServer starts once per run and the fake store lives on
// `globalThis`, so a CI retry of this file-level serial spec restarts from test
// 1 against state the first attempt already mutated and fails on something
// unrelated to the regression. The config's `retries: 2` stays for the legacy
// hydration-flaky specs its comment is actually about.
test.describe.configure({ mode: "serial", retries: 0 });

test.beforeEach(async ({ context }, testInfo) => {
  await authenticate(
    context,
    OWNER,
    requireBaseURL(testInfo.project.use.baseURL),
  );
});

test("exactly one project is open, and the active room decides which", async ({
  page,
}) => {
  await open(page, workspaceShellRoute(WORKSPACE_ID));

  await expect(projectAccordion(page, FIRST_PROJECT_NAME)).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(projectAccordion(page, SECOND_PROJECT_NAME)).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  await projectAccordion(page, SECOND_PROJECT_NAME).click();
  await expect(projectAccordion(page, SECOND_PROJECT_NAME)).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(projectAccordion(page, FIRST_PROJECT_NAME)).toHaveAttribute(
    "aria-expanded",
    "false",
  );

  // Deep-linking into a Room reveals the Project that Room lives in, whatever
  // the accordion was last left on.
  await projectAccordion(page, FIRST_PROJECT_NAME).click();
  await open(page, `/${WORKSPACE_ID}/rooms/${PRD_ROOM_ID}`);
  await expect(projectAccordion(page, SECOND_PROJECT_NAME)).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(
    page
      .getByTestId("workspace-side-nav")
      .getByRole("link", { name: "Pricing rework" }),
  ).toHaveAttribute("aria-current", "page");
});

test("the open project is stored per workspace and never shared between them", async ({
  page,
}) => {
  const storageKey = (workspaceId: string) =>
    `meld:workspace:${workspaceId}:open-project`;
  const storedProject = (workspaceId: string) =>
    page.evaluate(
      (key) => window.localStorage.getItem(key),
      storageKey(workspaceId),
    );

  await open(page, workspaceShellRoute(WORKSPACE_ID));
  await projectAccordion(page, SECOND_PROJECT_NAME).click();
  await expect(projectAccordion(page, SECOND_PROJECT_NAME)).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect.poll(() => storedProject(WORKSPACE_ID)).toBe(SECOND_PROJECT_ID);
  expect(await storedProject(PARTNER_WORKSPACE_ID)).toBeNull();

  // The choice is a memory, not a session: loading the workspace again opens
  // the Project that was left open, and leaves the record of it intact.
  await open(page, workspaceShellRoute(WORKSPACE_ID));
  await expect(projectAccordion(page, SECOND_PROJECT_NAME)).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect(projectAccordion(page, FIRST_PROJECT_NAME)).toHaveAttribute(
    "aria-expanded",
    "false",
  );
  expect(await storedProject(WORKSPACE_ID)).toBe(SECOND_PROJECT_ID);

  // The other workspace opens its own Project rather than inheriting a choice
  // made somewhere else, and records that choice under its own key.
  await open(page, workspaceShellRoute(PARTNER_WORKSPACE_ID));
  await expect(projectAccordion(page, PARTNER_PROJECT_NAME)).toHaveAttribute(
    "aria-expanded",
    "true",
  );
  await expect
    .poll(() => storedProject(PARTNER_WORKSPACE_ID))
    .toBe(PARTNER_PROJECT_ID);
});

test("a workspace shows its own projects and rooms and no others", async ({
  page,
}) => {
  await open(page, workspaceShellRoute(WORKSPACE_ID));
  const sideNav = page.getByTestId("workspace-side-nav");
  await expect(sideNav.getByText(WORKSPACE_NAME, { exact: true })).toBeVisible();
  await expect(projectAccordion(page, FIRST_PROJECT_NAME)).toBeVisible();
  await expect(
    projectAccordion(page, PARTNER_PROJECT_NAME),
  ).toHaveCount(0);

  await open(page, workspaceShellRoute(PARTNER_WORKSPACE_ID));
  await expect(projectAccordion(page, PARTNER_PROJECT_NAME)).toBeVisible();
  await expect(projectAccordion(page, FIRST_PROJECT_NAME)).toHaveCount(0);
  await expect(projectAccordion(page, SECOND_PROJECT_NAME)).toHaveCount(0);
  await expect(
    sideNav.getByRole("link", { name: "Checkout research" }),
  ).toHaveCount(0);
  await expect(
    sideNav.getByRole("link", { name: "Pricing rework" }),
  ).toHaveCount(0);
});

test("the rail names the workspace that is waiting", async ({ page }) => {
  await open(page, workspaceShellRoute(WORKSPACE_ID));
  const rail = page.getByTestId("workspace-rail");

  // The name carries the whole message; the dot beside it is decorative and
  // stays out of the announcement.
  await expect(
    rail.getByRole("link", { name: PARTNER_WORKSPACE_NAME }),
  ).toHaveAccessibleName(`${PARTNER_WORKSPACE_NAME} needs attention`);
  await expect(
    rail.getByRole("link", { name: WORKSPACE_NAME, exact: true }),
  ).toHaveAccessibleName(WORKSPACE_NAME);
  await expect(page.getByTestId("workspace-attention")).toHaveAttribute(
    "aria-hidden",
    "true",
  );
});

test("only an admin can create a project, and a room is created into one", async ({
  browser,
}, testInfo) => {
  const applicationOrigin = requireBaseURL(testInfo.project.use.baseURL);
  const member = await openAs(browser, MEMBER, applicationOrigin);
  const owner = await openAs(browser, OWNER, applicationOrigin);

  try {
    await open(member.page, workspaceShellRoute(WORKSPACE_ID));
    await expect(
      member.page.getByRole("button", { name: "Create project" }),
    ).toHaveCount(0);
    await expect(
      member.page.getByRole("button", {
        name: `Rename ${FIRST_PROJECT_NAME}`,
      }),
    ).toHaveCount(0);
    // Creating a Room is not an administrative act: every member may.
    await expect(
      member.page.getByRole("button", {
        name: `Add room to ${FIRST_PROJECT_NAME}`,
      }),
    ).toBeVisible();

    await open(owner.page, workspaceShellRoute(WORKSPACE_ID));
    await owner.page.getByRole("button", { name: "Create project" }).click();
    const createProjectDialog = owner.page.getByRole("dialog");
    await createProjectDialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Retention");
    await createProjectDialog
      .getByRole("button", { name: "Create project" })
      .click();
    await expect(projectAccordion(owner.page, "Retention")).toBeVisible();

    await projectAccordion(owner.page, "Retention").click();
    await owner.page
      .getByRole("button", { name: "Add room to Retention" })
      .click();
    const createRoomDialog = owner.page.getByRole("dialog");
    await createRoomDialog
      .getByRole("textbox", { name: "Name", exact: true })
      .fill("Churn interviews");
    await createRoomDialog.getByRole("button", { name: "Create room" }).click();
    await expect(
      owner.page
        .getByTestId("room-header")
        .getByRole("heading", { name: "Churn interviews" }),
    ).toBeVisible();
    await expect(projectAccordion(owner.page, "Retention")).toHaveAttribute(
      "aria-expanded",
      "true",
    );
    await expect(
      owner.page
        .getByTestId("workspace-side-nav")
        .getByRole("link", { name: "Churn interviews" }),
    ).toHaveAttribute("aria-current", "page");
  } finally {
    await member.context.close();
    await owner.context.close();
  }
});

test("a project holding rooms refuses to be deleted", async ({ page }) => {
  await open(page, workspaceShellRoute(WORKSPACE_ID));
  // Opened by default in a fresh browser, so its per-project actions are the
  // ones on screen.
  await expect(projectAccordion(page, FIRST_PROJECT_NAME)).toHaveAttribute(
    "aria-expanded",
    "true",
  );

  // Per-project actions live behind the project's options menu now.
  await page
    .getByRole("button", { name: `${FIRST_PROJECT_NAME} options` })
    .click();
  await page.getByRole("menuitem", { name: "Delete" }).click();
  const deleteDialog = page.getByRole("alertdialog");
  await deleteDialog.getByRole("button", { name: "Delete project" }).click();
  await expect(
    deleteDialog.getByText(
      "Move or delete this project's rooms before deleting the project.",
    ),
  ).toBeVisible();

  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(projectAccordion(page, FIRST_PROJECT_NAME)).toBeVisible();
});
