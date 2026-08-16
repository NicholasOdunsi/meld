import {
  expect,
  test,
  type Browser,
  type BrowserContext,
  type Page,
} from "@playwright/test";

// The corrected design says one Room accumulates structure over its life: it
// starts as a conversation, gains artifacts as the work produces them, and
// moves through stages and Projects without ever becoming a different Room.
// These specs drive that claim through the browser against the seeded
// fixtures in apps/web/src/features/{workspaces,rooms,canvas}/e2e-fake.ts.

const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const EMPTY_ROOM_ID = "40000000-0000-4000-8000-000000000002";
const PRD_ROOM_ID = "40000000-0000-4000-8000-000000000003";
const PROPOSAL_ROOM_ID = "40000000-0000-4000-8000-000000000004";

const DESTINATION_PROJECT_ID = "20000000-0000-4000-8000-000000000002";
const DESTINATION_PROJECT_NAME = "Meld E2E growth";

const DECISION_PROPOSAL_ID = "60000000-0000-4000-8000-000000000002";
const USER_FLOW_PROPOSAL_ID = "60000000-0000-4000-8000-000000000003";
const PRD_PROPOSAL_ID = "60000000-0000-4000-8000-000000000004";
const PROPOSED_DECISION_SUMMARY =
  "Ship the mobile checkout summary before adding payment methods.";

const OWNER = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
  name: "Owner Example",
};
const EDITOR = {
  id: "10000000-0000-4000-8000-000000000002",
  email: "teammate@example.com",
  name: "Teammate Example",
};
const PARTICIPATING_ADMIN = {
  id: "10000000-0000-4000-8000-000000000004",
  email: "admin@example.com",
  name: "Admin Example",
};
const NONPARTICIPANT_ADMIN = {
  id: "10000000-0000-4000-8000-000000000005",
  email: "distant-admin@example.com",
  name: "Distant Admin",
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

// The Room's tab strip. Named rather than assumed: the design system renders
// TabList as a labelled <nav> of links, not an ARIA tablist, so `role=tablist`
// would match nothing whether the strip exists or not.
function tabStrip(page: Page) {
  return page.getByRole("navigation", { name: "Room surfaces" });
}

function requireBaseURL(baseURL: string | undefined): string {
  if (typeof baseURL !== "string") {
    throw new Error("Playwright baseURL is required for room lifecycle E2E.");
  }
  return baseURL;
}

// Under `next dev` the server HTML arrives well before the bundle that brings
// it to life, and a click in that window is simply lost: a <button> with no
// listener yet does nothing at all. React attaches a fiber to every host node
// it hydrates, so the presence of one on a node deep in the tree is the signal
// that the page is actually interactive rather than merely painted.
async function settle(page: Page) {
  await page.waitForFunction(() => {
    const node = document.querySelector('[data-testid="workspace-navigation"]');
    return (
      node !== null &&
      Object.keys(node).some((key) => key.startsWith("__reactFiber$"))
    );
  });
}

async function open(page: Page, path: string) {
  await page.goto(path);
  await settle(page);
}

// The fake store reaches no Postgres, so no changefeed reaches a second
// browser. Reloading is how a browser that did not make a change reads it;
// what is being asserted either way is that the change is durable and shared,
// not that a socket delivered it.
async function readBack(page: Page) {
  await page.reload();
  await settle(page);
}

// The Room stage is changed only from the Conversation surface's coaching
// panel now, one stage forward at a time -- there is no header dropdown to jump
// straight to a later stage. Click each "Move to <next>" in turn and confirm
// the pill caught up before the next step.
async function moveStageThrough(page: Page, labels: readonly string[]) {
  const panel = page.getByTestId("stage-coaching-panel");
  for (const label of labels) {
    await panel.getByRole("button", { name: `Move to ${label}` }).click();
    await expect(page.getByTestId("stage-coaching-pill")).toContainText(label);
  }
}

// Open a Room surface from its tab, and prove the destination actually
// rendered.
//
// The retry is a `next dev` allowance, not a looser assertion: a Fast Refresh
// round can land on top of the client navigation that triggered it and the
// router puts the old URL back. It is deliberately narrow. Every surface
// component is statically imported by the single room route module and
// `global-setup.ts` already warms `?tab=decisions` and `?tab=overview`, so no
// click here is paying a first-compile cost -- the old 90s window was wide
// enough to retry a genuine intermittent navigation regression into a pass,
// which is precisely the class of bug this slice can introduce (a tab click
// racing `RoomSurfaceSync` or the `shouldReplaceUrl` replace). The measured
// flake is ~1 in 13, so ~30s and three attempts still absorb it.
//
// `expectedContent` is what stops the retry papering over a click that lands
// on the right URL and renders nothing: the URL alone was never evidence the
// surface opened.
async function openSurface(
  page: Page,
  name: string | RegExp,
  expectedUrl: string,
  expectedContent: (page: Page) => Promise<void>,
) {
  await expect(async () => {
    await page.getByRole("link", { name }).click();
    await expect(page).toHaveURL(expectedUrl, { timeout: 10_000 });
    await expectedContent(page);
  }).toPass({ timeout: 30_000 });
}

// No retries. The webServer starts once per run and the fake store lives on
// `globalThis` (`e2e-fake.ts`), so a CI retry of this file-level serial spec
// restarts from test 1 with the user flow already started, the stage already
// changed, the proposals already answered and the Room already moved: every
// attempt after the first fails on dirty state, at an assertion with nothing to
// do with the original regression. The config's `retries: 2` stays for the
// legacy hydration-flaky specs its comment is actually about.
test.describe.configure({ mode: "serial", retries: 0 });

test.beforeEach(async ({ context }, testInfo) => {
  await authenticate(
    context,
    OWNER,
    requireBaseURL(testInfo.project.use.baseURL),
  );
});

test("one room preserves context while structure and stage evolve", async ({
  page,
}) => {
  await open(page, `/${WORKSPACE_ID}/rooms/${EMPTY_ROOM_ID}`);
  await expect(tabStrip(page)).toHaveCount(0);

  // Pressing the Room's own control is what makes the surface exist. The empty
  // Room offers "Map a User Flow", which opens a choice card; "Map it myself"
  // is the hand-build path that starts the flow. Under `next dev` an on-demand
  // rebuild can swallow either the click or the navigation that follows it, so
  // this presses again, or reads the Room back when the press already landed,
  // until the surface is there. Safe because `start_user_flow` is idempotent by
  // design: a repeat cannot make a second flow, and a control that never works
  // still fails here.
  const mapUserFlow = page.getByText(/^Map a User Flow/);
  const mapItMyself = page.getByRole("button", { name: "Map it myself" });
  await expect(async () => {
    if ((await tabStrip(page).count()) > 0) return;
    if (!(await mapItMyself.isVisible().catch(() => false))) {
      if (await mapUserFlow.isVisible().catch(() => false)) {
        await mapUserFlow.click();
      } else {
        await readBack(page);
        await expect(tabStrip(page)).toBeVisible({ timeout: 5_000 });
        return;
      }
    }
    await mapItMyself.click();
    await expect(tabStrip(page)).toBeVisible({ timeout: 10_000 });
  }).toPass({ timeout: 120_000 });
  await expect(page.getByRole("link", { name: "Canvas" })).toBeVisible();

  // The stage is changed from the Conversation surface's coaching panel now,
  // one stage at a time -- there is no header dropdown to jump straight ahead.
  // Read the Room back onto its default (Conversation) surface, where the panel
  // lives, then advance Discovery -> Define.
  await open(page, `/${WORKSPACE_ID}/rooms/${EMPTY_ROOM_ID}`);
  await moveStageThrough(page, ["Define"]);

  // Moving the stage does not move the Room out from under whoever is reading
  // it: the panel refreshes the Conversation in place rather than navigating.
  await expect(page).toHaveURL(`/${WORKSPACE_ID}/rooms/${EMPTY_ROOM_ID}`);
  // The structure the Room gained survives the stage change: the Canvas is
  // still there. Define does not yet open the Prototype (that waits for Design),
  // so one artifact is still not two and there is nothing for an Overview to
  // summarize yet, while the Conversation the Room started as is still there.
  await expect(page.getByRole("link", { name: "Canvas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Overview" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Conversation" })).toBeVisible();
});

test("a PRD stands on its own without a user flow", async ({ page }) => {
  await open(page, `/${WORKSPACE_ID}/rooms/${PRD_ROOM_ID}`);

  await expect(page.getByRole("link", { name: /^PRD/ })).toBeVisible();
  await expect(page.getByRole("link", { name: "Canvas" })).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Overview" })).toHaveCount(0);

  await openSurface(
    page,
    /^PRD/,
    `/${WORKSPACE_ID}/rooms/${PRD_ROOM_ID}?tab=prd`,
    async (opened) =>
      expect(
        opened.getByRole("heading", { name: "Checkout redesign" }),
      ).toBeVisible(),
  );
});

test("a tab this room does not have falls back to the conversation", async ({
  page,
}) => {
  await open(page, `/${WORKSPACE_ID}/rooms/${PRD_ROOM_ID}?tab=user-flows`);

  await expect(page).toHaveURL(
    `/${WORKSPACE_ID}/rooms/${PRD_ROOM_ID}?tab=conversation`,
  );
  await expect(page.getByRole("combobox", { name: "Message" })).toBeVisible();
});

test("capturing a decision and creating a user flow cross the Overview threshold", async ({
  page,
}) => {
  await open(page, `/${WORKSPACE_ID}/rooms/${PROPOSAL_ROOM_ID}`);
  await expect(tabStrip(page)).toHaveCount(0);

  const decisionProposal = page.getByTestId(
    `room-proposal-${DECISION_PROPOSAL_ID}`,
  );
  await expect(
    decisionProposal.getByText(PROPOSED_DECISION_SUMMARY),
  ).toBeVisible();
  await decisionProposal
    .getByRole("button", { name: "Capture decision" })
    .click();
  await expect(decisionProposal).toHaveCount(0);

  // The tab strip is a server-rendered projection of the Room's durable
  // artifacts, so the surface appears on the next read of the Room.
  await readBack(page);
  await expect(page.getByRole("link", { name: "Decisions" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Overview" })).toHaveCount(0);

  const userFlowProposal = page.getByTestId(
    `room-proposal-${USER_FLOW_PROPOSAL_ID}`,
  );
  await userFlowProposal
    .getByRole("button", { name: "Create user flow" })
    .click();
  await expect(userFlowProposal).toHaveCount(0);
  await readBack(page);
  await expect(page.getByRole("link", { name: "Canvas" })).toBeVisible();
  await expect(page.getByRole("link", { name: "Overview" })).toBeVisible();

  await openSurface(
    page,
    "Decisions",
    `/${WORKSPACE_ID}/rooms/${PROPOSAL_ROOM_ID}?tab=decisions`,
    async (opened) =>
      expect(opened.getByText(PROPOSED_DECISION_SUMMARY)).toBeVisible(),
  );

  // The Overview is the surface that reads the whole Room back at once, so
  // crossing the threshold has to mean more than the tab appearing: who is in
  // the Room, what stage it is at, and the Decision it just captured all have
  // to render. Scoped to the surface because the Room header states the stage
  // too, and the strip carries a tab of the same name.
  await openSurface(
    page,
    "Overview",
    `/${WORKSPACE_ID}/rooms/${PROPOSAL_ROOM_ID}?tab=overview`,
    async (opened) =>
      expect(
        opened
          .getByTestId("room-surface")
          .getByRole("heading", { name: "Overview" }),
      ).toBeVisible(),
  );
  const roomSurface = page.getByTestId("room-surface");

  const participants = roomSurface.getByRole("list", {
    name: "Room participants",
  });
  await expect(participants.getByText(OWNER.email)).toBeVisible();
  await expect(participants.getByText(EDITOR.email)).toBeVisible();
  await expect(roomSurface.getByText("Discovery")).toBeVisible();

  const artifactCounts = roomSurface.getByRole("list", {
    name: "Artifact counts",
  });
  await expect(
    artifactCounts.getByRole("listitem").filter({ hasText: "User flows" }),
  ).toContainText("1");
  await expect(
    artifactCounts.getByRole("listitem").filter({ hasText: "Decisions" }),
  ).toContainText("1");
  await expect(
    artifactCounts.getByRole("listitem").filter({ hasText: "PRDs" }),
  ).toContainText("0");

  await expect(
    roomSurface
      .getByRole("list", { name: "Recent decisions" })
      .getByText(PROPOSED_DECISION_SUMMARY),
  ).toBeVisible();
});

test("a dismissal is this participant's alone and survives a reload", async ({
  browser,
}, testInfo) => {
  const applicationOrigin = requireBaseURL(testInfo.project.use.baseURL);
  const owner = await openAs(browser, OWNER, applicationOrigin);
  const editor = await openAs(browser, EDITOR, applicationOrigin);

  try {
    await open(owner.page, `/${WORKSPACE_ID}/rooms/${PROPOSAL_ROOM_ID}`);
    const ownerPrdProposal = owner.page.getByTestId(
      `room-proposal-${PRD_PROPOSAL_ID}`,
    );
    await expect(
      ownerPrdProposal.getByRole("button", { name: "Generate PRD" }),
    ).toBeVisible();
    await ownerPrdProposal.getByRole("button", { name: "Dismiss" }).click();
    await expect(ownerPrdProposal).toHaveCount(0);

    await readBack(owner.page);
    await expect(
      owner.page.getByTestId(`room-proposal-${PRD_PROPOSAL_ID}`),
    ).toHaveCount(0);

    await open(editor.page, `/${WORKSPACE_ID}/rooms/${PROPOSAL_ROOM_ID}`);
    await expect(
      editor.page
        .getByTestId(`room-proposal-${PRD_PROPOSAL_ID}`)
        .getByRole("button", { name: "Generate PRD" }),
    ).toBeVisible();
  } finally {
    await owner.context.close();
    await editor.context.close();
  }
});

test("a second participant confirming the same proposals creates nothing new", async ({
  browser,
}, testInfo) => {
  const applicationOrigin = requireBaseURL(testInfo.project.use.baseURL);
  const editor = await openAs(browser, EDITOR, applicationOrigin);

  try {
    // The owner already confirmed both of these, so the Room's Decision and
    // user flow exist. Confirming them again as someone else answers them for
    // that person and must produce nothing further for the Room.
    await open(editor.page, `/${WORKSPACE_ID}/rooms/${PROPOSAL_ROOM_ID}`);
    const decisionProposal = editor.page.getByTestId(
      `room-proposal-${DECISION_PROPOSAL_ID}`,
    );
    await decisionProposal
      .getByRole("button", { name: "Capture decision" })
      .click();
    await expect(decisionProposal).toHaveCount(0);

    const userFlowProposal = editor.page.getByTestId(
      `room-proposal-${USER_FLOW_PROPOSAL_ID}`,
    );
    await userFlowProposal
      .getByRole("button", { name: "Create user flow" })
      .click();
    await expect(userFlowProposal).toHaveCount(0);

    await open(
      editor.page,
      `/${WORKSPACE_ID}/rooms/${PROPOSAL_ROOM_ID}?tab=decisions`,
    );
    const decisions = editor.page
      .getByRole("list", { name: "Room decisions" })
      .getByRole("listitem");
    await expect(decisions).toHaveCount(1);
    await expect(decisions.first()).toContainText(PROPOSED_DECISION_SUMMARY);

    // And the Room's structure is unchanged: still one User Flows surface.
    await expect(
      tabStrip(editor.page).getByRole("link", { name: "Canvas" }),
    ).toHaveCount(1);
  } finally {
    await editor.context.close();
  }
});

test("stage and Project changes reach the room's other participants", async ({
  browser,
}, testInfo) => {
  const applicationOrigin = requireBaseURL(testInfo.project.use.baseURL);
  const owner = await openAs(browser, OWNER, applicationOrigin);
  const admin = await openAs(browser, PARTICIPATING_ADMIN, applicationOrigin);
  const editor = await openAs(browser, EDITOR, applicationOrigin);
  const roomPath = `/${WORKSPACE_ID}/rooms/${EMPTY_ROOM_ID}`;

  try {
    await open(editor.page, roomPath);
    // An edit participant sees the coaching panel but cannot move the stage:
    // the "Move to" control belongs to owners and workspace admins.
    await expect(
      editor.page.getByTestId("stage-coaching-pill"),
    ).toBeVisible();
    await expect(
      editor.page.getByRole("button", { name: /^Move to / }),
    ).toHaveCount(0);

    await open(owner.page, roomPath);
    await open(admin.page, roomPath);
    // The Room reached Define in the first spec; the admin advances it the rest
    // of the way to Development from the coaching panel, one stage at a time.
    await moveStageThrough(admin.page, ["Design", "Development"]);
    // The move above is optimistic. The sidebar is server-rendered and only
    // moves once `set_room_stage` has committed and revalidated, so it is what
    // says the change is durable rather than merely displayed.
    await expect(
      admin.page
        .getByTestId("workspace-side-nav")
        .getByRole("link", { name: "Onboarding research" })
        .getByTestId("room-icon"),
    ).toHaveAttribute("aria-label", "Development");

    await readBack(owner.page);
    await expect(
      owner.page.getByTestId("room-header").getByTestId("room-icon"),
    ).toHaveAttribute("aria-label", "Development stage");
    await expect(
      owner.page
        .getByTestId("workspace-side-nav")
        .getByRole("link", { name: "Onboarding research" })
        .getByTestId("room-icon"),
    ).toHaveAttribute("aria-label", "Development");

    // Moving the Room re-files it without renaming its address.
    await owner.page
      .getByTestId("workspace-side-nav")
      .getByRole("link", { name: "Onboarding research" })
      .hover();
    await owner.page
      .getByRole("button", { name: "Onboarding research options" })
      .click();
    await owner.page.getByRole("menuitem", { name: "Move room" }).click();
    await owner.page.getByRole("combobox", { name: "Project" }).click();
    await owner.page
      .getByRole("option", { name: DESTINATION_PROJECT_NAME })
      .click();
    await owner.page.getByRole("button", { name: "Move room" }).click();
    // The move committed once the mover's own server-rendered sidebar files the
    // Room under the destination Project -- and the address it was opened at is
    // unchanged.
    await expect(
      owner.page
        .getByTestId(`project-${DESTINATION_PROJECT_ID}`)
        .getByRole("link", { name: "Onboarding research" }),
    ).toBeVisible();
    await expect(owner.page).toHaveURL(roomPath);

    await readBack(admin.page);
    await expect(admin.page).toHaveURL(roomPath);
    await expect(
      admin.page.getByRole("button", {
        name: DESTINATION_PROJECT_NAME,
        exact: true,
      }),
    ).toHaveAttribute("aria-expanded", "true");
    await expect(
      admin.page
        .getByTestId("workspace-side-nav")
        .getByRole("link", { name: "Onboarding research" }),
    ).toBeVisible();
  } finally {
    await owner.context.close();
    await admin.context.close();
    await editor.context.close();
  }
});

test("a workspace admin who does not participate never reaches the room", async ({
  browser,
}, testInfo) => {
  const applicationOrigin = requireBaseURL(testInfo.project.use.baseURL);
  const distant = await openAs(
    browser,
    NONPARTICIPANT_ADMIN,
    applicationOrigin,
  );

  try {
    await open(distant.page, `/${WORKSPACE_ID}/rooms/${EMPTY_ROOM_ID}`);
    await expect(distant.page).toHaveURL(`/${WORKSPACE_ID}`);
    await expect(
      distant.page.getByRole("link", { name: "Onboarding research" }),
    ).toHaveCount(0);
  } finally {
    await distant.context.close();
  }
});
