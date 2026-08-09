import {
  expect,
  test,
  type BrowserContext,
  type Locator,
  type Page,
} from "@playwright/test";

const E2E_ORGANIZATION_ID =
  "00000000-0000-4000-8000-000000000001";
const E2E_ROOM_ID = "40000000-0000-4000-8000-000000000001";
const BASE_PATH = `/${E2E_ORGANIZATION_ID}/discovery/${E2E_ROOM_ID}`;
const EDITED_SUMMARY =
  "Reduce checkout friction with a transparent mobile order summary.";
const EDITED_REQUIREMENT =
  "Keep a transparent order total visible at every checkout step.";
const POST_ACCEPTANCE_SUMMARY =
  "Reduce checkout friction with a transparent summary and delivery context.";

// The three seeded people in the E2E room. Nothing in the product adds a room
// participant today (see e2e/discovery-room.spec.ts), so the teammate and the
// view-only participant come from the discovery fake's seed.
const OWNER = {
  id: "10000000-0000-4000-8000-000000000001",
  email: "owner@example.com",
  name: "Owner Example",
};
const TEAMMATE = {
  id: "10000000-0000-4000-8000-000000000002",
  email: "teammate@example.com",
  name: "Team Mate",
};
const VIEWER = {
  id: "10000000-0000-4000-8000-000000000003",
  email: "viewer@example.com",
  name: "View Only",
};

// The one neutral prompt. There is no Ask/Edit control to choose first.
const COMPOSER_PROMPT = "Ask about this or request a change...";

// The seven instructions the E2E fake pins to the four outcomes -- the design's
// four worked examples, plus its three multi-section ones. The table lives only in
// apps/web/src/features/discovery/e2e-fake.ts: production never inspects an
// instruction, so nothing here may either.
const QUESTION = "Why did we choose this?";
const BROAD_QUESTION = "Why are we going in this direction?";
const REWRITE = "Rewrite this for small teams.";
const TARGETED_REWRITE = "Rewrite the Proposed solution for small teams.";
const MIXED_REQUEST = "Explain this and make the rationale clearer.";
const AMBIGUOUS_REQUEST = "Fix this.";
const REWRITE_BOTH = "Rewrite both.";

const FAKE_ANSWER =
  "The Product Agent explains the tradeoff behind this section and cites the room's evidence.";
const SINGLE_SECTION_CLARIFICATION =
  "Which part of this section should I change first?";
const MULTI_SECTION_CLARIFICATION =
  "Which section should I change first?";
const APPLY_CONFLICT =
  "Could not apply the PRD proposal. The document may have changed.";
const USAGE_LIMIT_REASON = "That provider has reached its usage limit.";

// What the fake splices into a prose section when a proposal is applied, so an
// applied value is assertable without hardcoding the whole document.
function revisionMarker(instruction: string) {
  return `Product Agent revision: ${instruction}`;
}

function dialogWithTitle(page: Page, title: string) {
  return page.getByRole("dialog").or(page.getByRole("alertdialog")).filter({
    has: page.getByRole("heading", { name: title, exact: true }),
  });
}

function statusRow(page: Page) {
  return page.getByText("Status", { exact: true }).locator("..");
}

async function authenticate(
  context: BrowserContext,
  origin: string,
  user: { id: string; email: string; name: string },
) {
  await context.addCookies([
    { name: "meld-e2e-user-id", value: user.id, url: origin },
    { name: "meld-e2e-user-email", value: user.email, url: origin },
    { name: "meld-e2e-user-name", value: user.name, url: origin },
  ]);
}

function requireOrigin(baseURL: string | undefined): string {
  if (!baseURL) throw new Error("Playwright baseURL is required for PRD E2E.");
  return baseURL;
}

// ---------------------------------------------------------------------------
// The PRD tab
// ---------------------------------------------------------------------------

async function openPrdTab(page: Page) {
  await page.goto(`${BASE_PATH}?tab=prd`);
  await expect(
    page.getByRole("heading", { name: "Checkout redesign" }),
  ).toBeVisible();
  // The document is not finished moving when its heading appears. Two reads
  // land a round trip later -- the room's proposals, and the reader's own
  // earlier requests, which insert a notice above the document -- and either
  // one shifts every section down while a drag is being aimed at it. The PRD
  // tab polls every two seconds and each read is far shorter than that, so a
  // quiet network is a real barrier here (it is not on the Conversation tab,
  // which re-lists messages five times a second under the fake).
  await page
    .waitForLoadState("networkidle", { timeout: 15_000 })
    .catch(() => undefined);
}

async function openConversationTab(page: Page) {
  await page.goto(`${BASE_PATH}?tab=conversation`);
  await expect(
    page.getByRole("link", { name: /^PRD/ }),
  ).toBeVisible();
}

function prdSection(page: Page, field: string): Locator {
  return page.locator(`[data-prd-section-field="${field}"]`);
}

// A section's rendered body, without its heading: the paragraph a prose section
// renders, or the first row of a list one. This is what a reader would drag
// across, and what the frozen quote is taken from. Astryx's Markdown renders a
// paragraph as `<div role="paragraph">`, not `<p>`, so the role is what finds
// both kinds.
function prdSectionBody(page: Page, field: string): Locator {
  return prdSection(page, field).locator('[role="paragraph"], li').first();
}

async function currentPrdVersion(page: Page): Promise<string> {
  const row = page.getByText("Version", { exact: true }).locator("..");
  return (await row.innerText()).replace("Version", "").trim();
}

// The rendered label of each field these scenarios select, so a drag can prove
// it landed on the sections it meant to.
const SECTION_LABEL: Record<string, string> = {
  problemAndEvidence: "Problem & evidence",
  targetUsersAndUseCases: "Target users",
  goalsNonGoalsAndMetrics: "Goals & metrics",
  proposedSolution: "Proposed solution",
  userJourneys: "User journeys",
  nonFunctionalRequirements: "Non-functional requirements",
  dependenciesAndConstraints: "Dependencies & constraints",
  acceptanceCriteria: "Acceptance criteria",
  openQuestions: "Open questions",
};

// A real pointer drag across the rendered document, which is the only way the
// contextual composer is ever opened. Returns the popover, having checked that
// the scope it froze is the one the drag was aimed at -- a mis-measured drag
// otherwise fails much later, as a confusing assertion about the wrong section.
async function selectPrdText(
  page: Page,
  fields: readonly string[],
): Promise<Locator> {
  const from = prdSectionBody(page, fields[0]);
  const to = prdSectionBody(page, fields[fields.length - 1]);
  // Scroll the far end into view first, then the near end, so a multi-section
  // drag starts from a point that is still on screen.
  await to.scrollIntoViewIfNeeded();
  await from.scrollIntoViewIfNeeded();
  const firstFragment = (await from.innerText()).trim();
  // Press and release through `hover`, not raw coordinates: hover re-measures
  // the element and waits for it to hold still for two frames. Measuring first
  // and moving afterwards races the document's own reflow -- the recovery
  // notice arrives one round trip after mount and pushes every section down --
  // and a stale measurement silently starts the drag in the section above.
  await from.hover({ position: { x: 1, y: 4 } });
  await page.mouse.down();
  const end = await to.boundingBox();
  if (!end) {
    throw new Error(`Could not measure a selection across ${fields.join(", ")}`);
  }
  await to.hover({
    position: { x: end.width - 2, y: end.height - 4 },
    // The button is down: this is the drag, not a fresh pointer move.
    force: true,
  });
  await page.mouse.up();
  const composer = page.getByTestId("prd-selection-composer");
  await expect(composer).toBeVisible();
  if (fields.length === 1) {
    await expect(composer).toContainText(firstFragment);
  } else {
    await expect(composer).toContainText(`${fields.length} sections selected`);
    for (const field of fields) {
      await expect(composer).toContainText(SECTION_LABEL[field]);
    }
  }
  return composer;
}

async function ask(page: Page, instruction: string) {
  const composer = page.getByTestId("prd-selection-composer");
  await composer
    .getByRole("combobox", { name: COMPOSER_PROMPT })
    .fill(instruction);
  await composer.getByRole("button", { name: "Send" }).click();
}

async function closePopover(page: Page) {
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("prd-selection-composer")).toHaveCount(0);
}

// Follow an answer to the Conversation message it was also persisted as,
// returning that message's id. The popover is closed on the way out rather
// than abandoned: closing releases the settled request, and a request left on
// the reader's recovery list reappears as a notice above the document on the
// next PRD load, reflowing the sections under the next drag.
async function followAnswerToConversation(page: Page): Promise<string> {
  const composer = page.getByTestId("prd-selection-composer");
  const href = await composer
    .getByRole("link", { name: "Open in Conversation" })
    .getAttribute("href");
  expect(href).toMatch(/\?tab=conversation#message-[0-9a-f-]{36}$/);
  await closePopover(page);
  await page.goto(href!);
  return href!.split("#message-")[1];
}

function proposalCard(page: Page, field: string): Locator {
  return prdSection(page, field).getByTestId("prd-proposal-card");
}

async function discardProposal(page: Page, field: string) {
  await proposalCard(page, field)
    .getByRole("button", { name: "Discard" })
    .click();
  await expect(proposalCard(page, field)).toHaveCount(0);
}

// The section a scenario parks a sentinel proposal in while it proves that
// some *other* request added none.
const SENTINEL_FIELD = "dependenciesAndConstraints";

// Counting proposal cards straight after the document renders reads whatever
// the proposals effect has managed by that instant -- `PrdDocument` starts
// from an empty list and fills it from a poll, so the count is racing a round
// trip and can read zero while the room holds several. A real proposal on an
// unrelated section is the barrier: its card cannot render until
// listPrdProposals has resolved, so seeing it is proof that the number taken
// in the same breath is the room's actual one. Discard it with
// `discardProposal(page, SENTINEL_FIELD)` when the scenario is done.
async function proposalCountAfterSentinel(page: Page): Promise<number> {
  await selectPrdText(page, [SENTINEL_FIELD]);
  await ask(page, REWRITE);
  await expect(proposalCard(page, SENTINEL_FIELD)).toBeVisible();
  return page.getByTestId("prd-proposal-card").count();
}

// A proposal may only ever target a field inside the frozen scope -- the
// server checks `targetField` against it -- so "this request proposed nothing"
// is exactly "no card in the sections it was about". Scoped rather than counted
// across the whole document, because CI replays a failed scenario against
// whatever its own failed attempt left elsewhere in the room.
async function expectNoProposalIn(page: Page, fields: readonly string[]) {
  for (const field of fields) {
    await expect(proposalCard(page, field)).toHaveCount(0);
  }
}

// Leave the room the way each scenario found it. Discarding is not only
// tidiness here: `retries: 2` in CI replays a single test against whatever its
// failed attempt left behind, and a proposal outlives the test that made it.
async function discardAnyProposals(page: Page) {
  const cards = page.getByTestId("prd-proposal-card");
  for (let remaining = await cards.count(); remaining > 0; remaining -= 1) {
    await cards.first().getByRole("button", { name: "Discard" }).click();
    await expect(cards).toHaveCount(remaining - 1);
  }
}

// ---------------------------------------------------------------------------
// The Conversation tab
// ---------------------------------------------------------------------------

function messageBubbles(page: Page): Locator {
  return page.locator('[data-testid^="conversation-message-"]');
}

function changeEvents(page: Page): Locator {
  return page.getByTestId("prd-change-event");
}

function bubbleContaining(page: Page, text: string): Locator {
  return messageBubbles(page).filter({ hasText: text });
}

// RETRY-FATAL: `body` persists, so a replayed attempt finds two bubbles and
// this fails. It is a total rather than a delta because the point is to know
// the send landed -- a delta would pass on a bubble the previous attempt left.
async function postRoomMessage(page: Page, body: string) {
  await page.getByRole("combobox", { name: "Message" }).fill(body);
  await page.getByRole("button", { name: "Send" }).click();
  await expect(bubbleContaining(page, body)).toHaveCount(1);
}

// A roomy desktop viewport: several of these scenarios drag a selection across
// two or three adjacent sections, which has to fit on screen in one go.
const DESKTOP_VIEWPORT = { width: 1440, height: 1000 };
test.use({ viewport: DESKTOP_VIEWPORT });

test.beforeEach(async ({ context }, testInfo) => {
  const applicationOrigin = testInfo.project.use.baseURL;
  if (typeof applicationOrigin !== "string") {
    throw new Error("Playwright baseURL is required for PRD E2E auth.");
  }

  await authenticate(context, applicationOrigin, OWNER);
});

// A scenario that fails half way through leaves the room without a pending
// proposal anyway -- otherwise the CI retry replays it against a section that
// already has a card, and the replay's own proposal is the second one in that
// section rather than the one under review. A scenario that passed has already
// applied or discarded everything it made, so this costs a green run nothing.
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status === testInfo.expectedStatus) return;
  if (page.isClosed()) return;
  // A scenario may have shrunk the window past the desktop gate, where there is
  // no document to sweep at all. Put it back before looking.
  await page.setViewportSize(DESKTOP_VIEWPORT);
  // openPrdTab already waits for the mount reads to land, which is what makes
  // an unrendered card impossible to miss here.
  await openPrdTab(page);
  await discardAnyProposals(page);
});

test("an owner edits, reviews, accepts, and preserves accepted PRD history", async ({
  page,
}) => {
  await page.goto(
    `/${E2E_ORGANIZATION_ID}/discovery/${E2E_ROOM_ID}?tab=prd`,
  );

  await expect(
    page.getByRole("heading", { name: "Checkout redesign" }),
  ).toBeVisible();
  await expect(page.getByText("v1", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByRole("textbox", { name: "Executive summary" })
    .fill(EDITED_SUMMARY);
  await page
    .getByRole("textbox", {
      name: "Functional requirements row 1",
      exact: true,
    })
    .fill(EDITED_REQUIREMENT);
  await page.getByRole("button", { name: "Save changes" }).first().click();

  await expect(page.getByText("v2", { exact: true })).toBeVisible();
  await expect(page.getByText(EDITED_SUMMARY)).toBeVisible();
  await expect(page.getByText(EDITED_REQUIREMENT)).toBeVisible();

  await page.reload();
  await expect(page.getByText("v2", { exact: true })).toBeVisible();
  await expect(page.getByText(EDITED_SUMMARY)).toBeVisible();
  await expect(page.getByText(EDITED_REQUIREMENT)).toBeVisible();

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Version history" }).click();
  const history = dialogWithTitle(page, "Version history");
  await expect(history.getByText("Version v2")).toBeVisible();
  await expect(history.getByText("Version v1")).toBeVisible();
  await expect(
    history.getByText("v2 compared with v1"),
  ).toBeVisible();
  await expect(history.getByText("Executive summary changed")).toBeVisible();
  await expect(
    history.getByText("Functional requirements: 1 added, 1 removed"),
  ).toBeVisible();
  await history.getByRole("button", { name: "Close" }).click();

  await page.getByRole("button", { name: "Accept version" }).click();
  const acceptance = dialogWithTitle(page, "Record version v2?");
  await acceptance
    .getByRole("button", { name: "Record acceptance" })
    .click();
  await expect(
    statusRow(page).getByText("Accepted", { exact: true }),
  ).toBeVisible();

  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByRole("textbox", { name: "Executive summary" })
    .fill(POST_ACCEPTANCE_SUMMARY);
  await page.getByRole("button", { name: "Save changes" }).first().click();

  await expect(page.getByText("v3", { exact: true })).toBeVisible();
  await expect(
    statusRow(page).getByText("Current draft", { exact: true }),
  ).toBeVisible();
  await expect(page.getByText("Last accepted v2", { exact: true })).toBeVisible();
  await expect(page.getByText(POST_ACCEPTANCE_SUMMARY)).toBeVisible();

  await page.getByRole("button", { name: "More options" }).click();
  await page.getByRole("menuitem", { name: "Version history" }).click();
  const updatedHistory = dialogWithTitle(page, "Version history");
  await expect(updatedHistory.getByText("Version v3")).toBeVisible();
  // Version history compares the selected row with its nearest newer row, so
  // selecting v1 proves the immutable v2 snapshot is still compared to v1.
  await updatedHistory.getByRole("button", { name: /^Version v1 Draft/ }).click();
  await expect(
    updatedHistory.getByText("v2 compared with v1"),
  ).toBeVisible();
  await expect(
    updatedHistory.getByText("Functional requirements: 1 added, 1 removed"),
  ).toBeVisible();

  await updatedHistory.getByRole("button", { name: /^Version v3 Draft/ }).click();
  await expect(
    updatedHistory.getByText("v3 compared with v2"),
  ).toBeVisible();
  await expect(
    updatedHistory.getByText("Executive summary changed"),
  ).toBeVisible();
  await expect(
    updatedHistory.getByText(/^Functional requirements:/),
  ).toHaveCount(0);
});

// ---------------------------------------------------------------------------
// One composer, four outcomes.
//
// Every scenario below drives the same surface: select rendered PRD text, type
// once into the one neutral composer, and let the Product Agent decide whether
// that was a question, a change, both, or something it has to ask about first.
// The user never picks a mode and never picks a destination.
//
// The outcomes are deterministic because the E2E fake pins seven instructions
// to four results (apps/web/src/features/discovery/e2e-fake.ts). That table is
// fixture data standing in for the model. Nothing in production routing reads
// an instruction, and these scenarios therefore prove the plumbing around the
// classification -- persistence, permissions, review, recovery -- not the
// classification itself.
//
// They share one room, run in declaration order, and -- because CI sets
// `retries: 2` -- a failing scenario is replayed against the state its own
// failed attempt left. So:
//
//   * anything that counts Conversation entries counts a delta, since a
//     replay re-reads the total before adding to it;
//   * proposals are cleared after every scenario, since a card outlives the
//     test that made it and a replayed request would find its section already
//     occupied;
//   * `prd_change` entries and persisted Q&A are NOT undone -- nothing can
//     undo them -- so a replay adds a second copy of both. Assertions about
//     them are therefore deltas or `.last()` wherever that was achievable.
//
// Three places it was NOT achievable, and they are retry-FATAL rather than
// falsely green -- a replay makes them fail, it never makes them pass wrongly:
//
//   * `postRoomMessage` asserts `toHaveCount(1)` on the body it just sent, to
//     know the send landed before moving on. The body persists, so a replay
//     finds two. Sending a body unique per attempt would fix it;
//   * the follow-up in the second-participant scenario asserts the same shape
//     across the other browser context, for the same reason;
//   * the ambiguity scenario asserts `prd-context` rows `toHaveCount(4)` --
//     two exchanges against one frozen fragment. A replay adds four more.
//
// Everything else about persisted Q&A is a delta or a `.last()`.
//
// The one exception is the acceptance walk at the top of this file, which
// asserts `v1` and so must stay first.
// ---------------------------------------------------------------------------

test("a question about selected text is answered in place and becomes shared Conversation history", async ({
  page,
}) => {
  await openPrdTab(page);
  const version = await currentPrdVersion(page);
  const quote = (
    await prdSectionBody(page, "proposedSolution").innerText()
  ).trim();

  const composer = await selectPrdText(page, ["proposedSolution"]);
  // The composer opens on the selection alone: no Ask/Edit choice to make.
  await expect(composer).toContainText(quote);
  await expect(
    composer.getByRole("combobox", { name: COMPOSER_PROMPT }),
  ).toBeVisible();

  await ask(page, QUESTION);
  await expect(composer).toContainText(FAKE_ANSWER);
  // A question never mutates: nothing to apply in what it was asked about.
  await expectNoProposalIn(page, ["proposedSolution"]);

  const answerId = await followAnswerToConversation(page);
  const answer = page.locator(`#message-${answerId}`);
  await expect(answer).toContainText(FAKE_ANSWER);
  await expect(answer).toContainText("via Codex");
  await expect(answer.getByTestId("prd-context")).toContainText("Proposed solution");
  await expect(answer.getByTestId("prd-context")).toContainText(version);
  await expect(answer.getByTestId("prd-context")).toContainText(quote);

  const question = bubbleContaining(page, QUESTION).last();
  await expect(question).toContainText(OWNER.name);
  await expect(question.getByTestId("prd-context")).toContainText("Proposed solution");
  await expect(question.getByTestId("prd-context")).toContainText(quote);
});

test("a question spanning three sections gets one answer and one shared three-section context", async ({
  page,
}) => {
  const fields = [
    "goalsNonGoalsAndMetrics",
    "proposedSolution",
    "userJourneys",
  ];
  const labels = ["Goals & metrics", "Proposed solution", "User journeys"];

  await openPrdTab(page);
  const quotes = [] as string[];
  for (const field of fields) {
    quotes.push((await prdSectionBody(page, field).innerText()).trim());
  }

  const composer = await selectPrdText(page, fields);
  await expect(composer).toContainText("3 sections selected");
  for (const label of labels) {
    await expect(composer).toContainText(label);
  }

  await ask(page, BROAD_QUESTION);
  // One synthesized answer, not one per section.
  await expect(composer.getByText(FAKE_ANSWER)).toHaveCount(1);
  await expectNoProposalIn(page, fields);

  await followAnswerToConversation(page);

  const question = bubbleContaining(page, BROAD_QUESTION).last();
  const context = question.getByTestId("prd-context");
  await expect(context).toContainText("3 selected sections");
  for (const label of labels) {
    await expect(context.getByRole("link", { name: label })).toHaveAttribute(
      "href",
      /\?tab=prd#/,
    );
  }
  await context.getByRole("button", { name: "Selected excerpts" }).click();
  for (const quote of quotes) {
    await expect(context).toContainText(quote);
  }
  // The same frozen scope grounds the answer, not just the question.
  await expect(
    bubbleContaining(page, FAKE_ANSWER)
      .last()
      .getByTestId("prd-context"),
  ).toContainText("3 selected sections");
});

test("a multi-section request naming one section proposes a change to exactly that section", async ({
  page,
}) => {
  const fields = ["goalsNonGoalsAndMetrics", "proposedSolution"];

  await openPrdTab(page);
  await selectPrdText(page, fields);
  await expect(
    page.getByTestId("prd-selection-composer"),
  ).toContainText("2 sections selected");

  await ask(page, TARGETED_REWRITE);

  // Exactly one proposal across the frozen scope -- the only place one may
  // legally land -- and it is in the section the instruction named, which is
  // not the first section of the selection. A section renders at most one
  // card, so these two assertions together are "exactly one".
  await expect(proposalCard(page, "proposedSolution")).toBeVisible();
  await expectNoProposalIn(page, ["goalsNonGoalsAndMetrics"]);
  // An edit-only outcome has nothing to say in the popover, so it closes.
  await expect(page.getByTestId("prd-selection-composer")).toHaveCount(0);

  await discardProposal(page, "proposedSolution");
});

test("a multi-section request to change both sections asks which comes first and proposes nothing", async ({
  page,
}) => {
  const fields = ["goalsNonGoalsAndMetrics", "proposedSolution"];

  await openPrdTab(page);
  const composer = await selectPrdText(page, fields);
  await ask(page, REWRITE_BOTH);

  await expect(composer).toContainText("Product Agent");
  await expect(composer).toContainText(MULTI_SECTION_CLARIFICATION);
  // Ambiguity biases toward clarification, never toward mutation.
  await expectNoProposalIn(page, fields);
  // The same input comes back for the reply, still scoped the same way.
  await expect(
    composer.getByRole("combobox", { name: COMPOSER_PROMPT }),
  ).toBeVisible();
  await expect(composer).toContainText("2 sections selected");

  await closePopover(page);
});

test("an edit stays out of Conversation until it is applied, then posts one compact change", async ({
  page,
}) => {
  await openConversationTab(page);
  const bubblesBefore = await messageBubbles(page).count();
  const changesBefore = await changeEvents(page).count();

  await openPrdTab(page);
  const before = (
    await prdSectionBody(page, "problemAndEvidence").innerText()
  ).trim();
  await selectPrdText(page, ["problemAndEvidence"]);
  await ask(page, REWRITE);

  const card = proposalCard(page, "problemAndEvidence");
  await expect(card).toBeVisible();
  await expect(card).toContainText(revisionMarker(REWRITE));
  // Nothing was written to the document by the proposal itself.
  await expect(prdSectionBody(page, "problemAndEvidence")).toHaveText(before);

  await openConversationTab(page);
  await expect(messageBubbles(page)).toHaveCount(bubblesBefore);
  await expect(changeEvents(page)).toHaveCount(changesBefore);

  await openPrdTab(page);
  await proposalCard(page, "problemAndEvidence")
    .getByRole("button", { name: "Apply changes" })
    .click();
  await expect(proposalCard(page, "problemAndEvidence")).toHaveCount(0);
  await expect(prdSectionBody(page, "problemAndEvidence")).toContainText(
    revisionMarker(REWRITE),
  );

  await openConversationTab(page);
  await expect(changeEvents(page)).toHaveCount(changesBefore + 1);
  // An applied edit is an event in the record, not something anyone said.
  await expect(messageBubbles(page)).toHaveCount(bubblesBefore);
  const event = changeEvents(page).last();
  await expect(event).toContainText(
    "Applied a Product Agent edit to Problem & evidence.",
  );
  await event.getByRole("button", { name: "Instruction and change" }).click();
  await expect(event).toContainText(REWRITE);
  await expect(event).toContainText("Before");
  await expect(event).toContainText(before);
  await expect(event).toContainText("After");
});

test("discarding a proposal leaves no trace in Conversation", async ({
  page,
}) => {
  await openConversationTab(page);
  // A control message before the attempt, so "nothing appeared" is measured
  // against a thread that is demonstrably live rather than merely slow.
  await postRoomMessage(page, "Checking the record before a discarded edit.");
  const bubblesBefore = await messageBubbles(page).count();
  const changesBefore = await changeEvents(page).count();

  await openPrdTab(page);
  await selectPrdText(page, ["targetUsersAndUseCases"]);
  await ask(page, REWRITE);
  await expect(proposalCard(page, "targetUsersAndUseCases")).toBeVisible();
  await discardProposal(page, "targetUsersAndUseCases");

  await openConversationTab(page);
  // A second control message, posted after the discard: once it renders, the
  // thread has caught up past the attempt, so an absent entry is absent.
  await postRoomMessage(page, "Checking the record after a discarded edit.");
  await expect(messageBubbles(page)).toHaveCount(bubblesBefore + 1);
  await expect(changeEvents(page)).toHaveCount(changesBefore);
  await expect(bubbleContaining(page, REWRITE)).toHaveCount(0);
});

test("a mixed request shares its answer while its proposal waits for Apply", async ({
  page,
}) => {
  await openConversationTab(page);
  const changesBefore = await changeEvents(page).count();

  await openPrdTab(page);
  const before = (await prdSectionBody(page, "userJourneys").innerText()).trim();
  const composer = await selectPrdText(page, ["userJourneys"]);
  await ask(page, MIXED_REQUEST);

  // The answer stays in the popover; the proposal renders in its section.
  await expect(composer).toContainText(FAKE_ANSWER);
  await expect(proposalCard(page, "userJourneys")).toBeVisible();
  await expect(prdSectionBody(page, "userJourneys")).toHaveText(before);

  await closePopover(page);
  await openConversationTab(page);
  await expect(
    bubbleContaining(page, MIXED_REQUEST).last().getByTestId("prd-context"),
  ).toContainText("User journeys");
  await expect(bubbleContaining(page, FAKE_ANSWER).last()).toBeVisible();
  // The answer is shared, but the change has not happened yet.
  await expect(changeEvents(page)).toHaveCount(changesBefore);

  await openPrdTab(page);
  await proposalCard(page, "userJourneys")
    .getByRole("button", { name: "Apply changes" })
    .click();
  await expect(proposalCard(page, "userJourneys")).toHaveCount(0);

  await openConversationTab(page);
  await expect(changeEvents(page)).toHaveCount(changesBefore + 1);
  await expect(changeEvents(page).last()).toContainText(
    "Applied a Product Agent edit to User journeys.",
  );
});

test("an ambiguous request asks for clarification and is answered in the same composer", async ({
  page,
}) => {
  await openPrdTab(page);
  const quote = (
    await prdSectionBody(page, "acceptanceCriteria").innerText()
  ).trim();
  // Counted against a loaded list rather than asserted at zero: this room has
  // been through several proposals by now, and what matters is that neither of
  // these two turns adds one.
  const cardsBefore = await proposalCountAfterSentinel(page);

  const composer = await selectPrdText(page, ["acceptanceCriteria"]);
  await ask(page, AMBIGUOUS_REQUEST);
  await expect(composer).toContainText(SINGLE_SECTION_CLARIFICATION);
  await expect(page.getByTestId("prd-proposal-card")).toHaveCount(cardsBefore);

  // The reply goes into the same input, against the same frozen selection.
  await ask(page, QUESTION);
  await expect(composer).toContainText(FAKE_ANSWER);
  await expect(page.getByTestId("prd-proposal-card")).toHaveCount(cardsBefore);

  await followAnswerToConversation(page);
  // Both exchanges are persisted, both against the same frozen fragment.
  await expect(
    bubbleContaining(page, AMBIGUOUS_REQUEST).last().getByTestId("prd-context"),
  ).toContainText(quote);
  await expect(
    bubbleContaining(page, SINGLE_SECTION_CLARIFICATION)
      .last()
      .getByTestId("prd-context"),
  ).toContainText(quote);
  // RETRY-FATAL: four persisted rows -- two exchanges, question and reply --
  // and a replayed attempt adds four more.
  await expect(
    page.getByTestId("prd-context").filter({ hasText: quote }),
  ).toHaveCount(4);

  await openPrdTab(page);
  await discardProposal(page, SENTINEL_FIELD);
});

test("a second participant sees the shared exchange and follows it up from the room composer", async ({
  browser,
  baseURL,
}) => {
  const origin = requireOrigin(baseURL);
  const ownerContext = await browser.newContext();
  await authenticate(ownerContext, origin, OWNER);
  const ownerPage = await ownerContext.newPage();
  const teammateContext = await browser.newContext();
  await authenticate(teammateContext, origin, TEAMMATE);
  const teammatePage = await teammateContext.newPage();

  await openPrdTab(ownerPage);
  const quote = (
    await prdSectionBody(ownerPage, "nonFunctionalRequirements").innerText()
  ).trim();
  const composer = await selectPrdText(ownerPage, [
    "nonFunctionalRequirements",
  ]);
  await ask(ownerPage, QUESTION);
  await expect(composer).toContainText(FAKE_ANSWER);
  await closePopover(ownerPage);
  await openConversationTab(ownerPage);

  // The teammate never touched the PRD tab and still sees the whole exchange,
  // attributed to the owner, with the frozen context.
  await openConversationTab(teammatePage);
  const question = bubbleContaining(teammatePage, QUESTION).last();
  await expect(question).toContainText(OWNER.email);
  await expect(question.getByTestId("prd-context")).toContainText(quote);
  const answer = bubbleContaining(teammatePage, FAKE_ANSWER).last();
  await expect(answer).toContainText("Product Agent");
  await expect(answer).toContainText(`Asked by ${OWNER.email}`);

  // And follows up through the room's own persistent composer -- the only
  // permanent composer there is.
  const followUp = "Following up on the Product Agent's answer.";
  await postRoomMessage(teammatePage, followUp);
  await expect(bubbleContaining(ownerPage, followUp)).toHaveCount(1);

  await teammateContext.close();
  await ownerContext.close();
});

test("a proposal goes stale when the section changes first, and never overwrites the newer value", async ({
  page,
}) => {
  const NEWER_SOLUTION =
    "Show a transparent order summary that a teammate edited by hand first.";

  await openPrdTab(page);
  await selectPrdText(page, ["proposedSolution"]);
  await ask(page, REWRITE);
  await expect(proposalCard(page, "proposedSolution")).toBeVisible();

  // The target field moves under the proposal, by hand, before it is applied.
  await page.getByRole("button", { name: "Edit" }).click();
  await page
    .getByRole("textbox", { name: "Proposed solution" })
    .fill(NEWER_SOLUTION);
  await page.getByRole("button", { name: "Save changes" }).first().click();
  await expect(prdSectionBody(page, "proposedSolution")).toHaveText(
    NEWER_SOLUTION,
  );

  const card = proposalCard(page, "proposedSolution");
  await expect(card).toBeVisible();
  await card.getByRole("button", { name: "Apply changes" }).click();

  // The refusal stays on the card, and the newer value is untouched.
  await expect(card).toContainText(APPLY_CONFLICT);
  await expect(prdSectionBody(page, "proposedSolution")).toHaveText(
    NEWER_SOLUTION,
  );
  await expect(card.getByRole("button", { name: "Discard" })).toBeEnabled();

  await discardProposal(page, "proposedSolution");
});

test("a view-only participant may ask but may never produce or apply a proposal", async ({
  browser,
  baseURL,
}) => {
  const origin = requireOrigin(baseURL);
  const ownerContext = await browser.newContext();
  await authenticate(ownerContext, origin, OWNER);
  const ownerPage = await ownerContext.newPage();
  const viewerContext = await browser.newContext();
  await authenticate(viewerContext, origin, VIEWER);
  const viewerPage = await viewerContext.newPage();

  // An editor leaves a live proposal in the room.
  await openPrdTab(ownerPage);
  await selectPrdText(ownerPage, ["dependenciesAndConstraints"]);
  await ask(ownerPage, REWRITE);
  await expect(proposalCard(ownerPage, "dependenciesAndConstraints")).toBeVisible();

  await openPrdTab(viewerPage);
  // Reviewing an edit is not theirs to do: no card, no Apply, no hand editing.
  await expect(viewerPage.getByTestId("prd-proposal-card")).toHaveCount(0);
  await expect(
    viewerPage.getByRole("button", { name: "Apply changes" }),
  ).toHaveCount(0);
  await expect(
    viewerPage.getByRole("button", { name: "Edit", exact: true }),
  ).toHaveCount(0);

  // Asking, though, is open to every participant -- even when what they typed
  // was a change request, which comes back as an answer rather than a refusal.
  const quote = (
    await prdSectionBody(viewerPage, "openQuestions").innerText()
  ).trim();
  const composer = await selectPrdText(viewerPage, ["openQuestions"]);
  await ask(viewerPage, REWRITE);
  await expect(composer).toContainText(FAKE_ANSWER);
  await expect(viewerPage.getByTestId("prd-proposal-card")).toHaveCount(0);

  await followAnswerToConversation(viewerPage);
  await expect(
    bubbleContaining(viewerPage, REWRITE).last().getByTestId("prd-context"),
  ).toContainText(quote);

  // The editor's own proposal is untouched by any of it.
  await expect(proposalCard(ownerPage, "dependenciesAndConstraints")).toBeVisible();
  await discardProposal(ownerPage, "dependenciesAndConstraints");

  await viewerContext.close();
  await ownerContext.close();
});

test("a usage-limit failure recovers on the other provider with the same instruction and quote", async ({
  page,
  context,
}, testInfo) => {
  const origin = requireOrigin(testInfo.project.use.baseURL);

  await openPrdTab(page);
  const quote = (
    await prdSectionBody(page, "problemAndEvidence").innerText()
  ).trim();
  // The sentinel goes in before the usage limit is seeded: a seeded failure
  // belongs to the default provider, so a request made after it would fail too
  // and leave no card to count against.
  const cardsBefore = await proposalCountAfterSentinel(page);
  await context.addCookies([
    { name: "meld-e2e-task-status", value: "usage_limit_reached", url: origin },
  ]);

  const composer = await selectPrdText(page, ["problemAndEvidence"]);
  await ask(page, QUESTION);

  await expect(composer).toContainText("The Product Agent could not answer this");
  await expect(composer).toContainText(USAGE_LIMIT_REASON);
  // A failed attempt leaves nothing behind either.
  await expect(page.getByTestId("prd-proposal-card")).toHaveCount(cardsBefore);

  // The seeded limit belongs to the provider that hit it, so the alternate
  // provider recovers -- carrying the original instruction and scope with it.
  await expect(composer).toContainText(quote);
  await composer.getByRole("button", { name: "Try with Claude" }).click();
  await expect(composer).toContainText(FAKE_ANSWER);
  await expect(composer).toContainText(quote);

  await followAnswerToConversation(page);
  const question = bubbleContaining(page, QUESTION).last();
  await expect(question.getByTestId("prd-context")).toContainText(quote);
  const answer = bubbleContaining(page, FAKE_ANSWER).last();
  await expect(answer).toContainText("via Claude");
  await expect(answer.getByTestId("prd-context")).toContainText(quote);

  await openPrdTab(page);
  await discardProposal(page, SENTINEL_FIELD);
});

// The layout contract the design states outright: the popover is the only new
// surface, and it takes nothing away from the room it opens over.
//
// Both viewports are desktop ones on purpose. The web app refuses to render
// below 769px (`DesktopOnlyGate`), so a phone has no PRD surface to check --
// the test below pins that, so "mobile was not verified" reads as "there is
// nothing there yet" rather than as a gap.
for (const viewport of [
  { name: "wide", width: 1440, height: 1000 },
  { name: "narrow", width: 860, height: 700 },
]) {
  test(`the ${viewport.name} PRD keeps its layout while a request is open`, async ({
    page,
  }) => {
    await page.setViewportSize({ width: viewport.width, height: viewport.height });
    await openPrdTab(page);

    // No permanent composer, and no per-section Ask control.
    await expect(page.getByTestId("prd-selection-composer")).toHaveCount(0);
    await expect(
      page.getByRole("combobox", { name: COMPOSER_PROMPT }),
    ).toHaveCount(0);
    await expect(page.getByRole("button", { name: /^Ask/ })).toHaveCount(0);

    const tabs = page.getByRole("navigation", { name: "Tabs" });
    const rail = page.getByTestId("prd-outline-rail");
    // Where each surface sits horizontally. A new chat surface is what the
    // design forbids, and that is what would take width from the rail or the
    // document; vertical position moves with the scroll a selection needs.
    const column = async (locator: Locator) => {
      const box = await locator.boundingBox();
      return box === null ? null : { x: box.x, width: box.width };
    };
    const railBefore = await column(rail);
    const tabsBefore = await tabs.boundingBox();
    const bodyBefore = await column(prdSection(page, "executiveSummary"));

    const composer = await selectPrdText(page, ["problemAndEvidence"]);
    await ask(page, QUESTION);
    await expect(composer).toContainText(FAKE_ANSWER);

    // The popover stays inside the viewport.
    const box = (await composer.boundingBox())!;
    expect(box.x).toBeGreaterThanOrEqual(0);
    expect(box.y).toBeGreaterThanOrEqual(0);
    expect(box.x + box.width).toBeLessThanOrEqual(viewport.width + 1);
    expect(box.y + box.height).toBeLessThanOrEqual(viewport.height + 1);

    // The answer stays inside the popover rather than spilling over the
    // document behind it.
    const answer = (await composer.getByText(FAKE_ANSWER).boundingBox())!;
    expect(answer.x).toBeGreaterThanOrEqual(box.x - 1);
    expect(answer.y).toBeGreaterThanOrEqual(box.y - 1);
    expect(answer.x + answer.width).toBeLessThanOrEqual(box.x + box.width + 1);
    expect(answer.y + answer.height).toBeLessThanOrEqual(box.y + box.height + 1);

    // Nothing was displaced to make room for it: the outline rail, the tab
    // strip, and the document column all sit exactly where they did.
    await expect(rail).toBeVisible();
    expect(await column(rail)).toEqual(railBefore);
    expect(await tabs.boundingBox()).toEqual(tabsBefore);
    expect(await column(prdSection(page, "executiveSummary"))).toEqual(
      bodyBefore,
    );
    await expect(page.getByRole("link", { name: /^Conversation/ })).toBeVisible();
    await expect(page.getByRole("link", { name: /^PRD/ })).toBeVisible();

    await closePopover(page);
    await expect(
      page.getByRole("combobox", { name: COMPOSER_PROMPT }),
    ).toHaveCount(0);
  });
}

test("below the desktop breakpoint the room is gated, so there is no mobile PRD surface", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto(`${BASE_PATH}?tab=prd`);

  await expect(
    page.getByRole("heading", { name: "Please use Meld on desktop" }),
  ).toBeVisible();
  await expect(page.getByTestId("prd-selection-composer")).toHaveCount(0);
  await expect(page.locator("[data-prd-section-field]")).toHaveCount(0);
});
