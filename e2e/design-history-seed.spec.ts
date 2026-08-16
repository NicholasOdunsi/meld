import { expect, test, type Page } from "@playwright/test";

// Fixtures from apps/web/src/features/rooms/e2e-fake.ts
// (E2E_DESIGN_HISTORY_ROOM_ID): a Design-stage room with the User Flows
// canvas already started and a PRD whose journey flow carries exactly one
// action node ("Pick plan"). Proves slice 3c end to end through the fake
// gateway/provider path (isRoomFakeEnabled): opening the Canvas seeds a
// screen frame from the flow's action node, and the History drawer surfaces
// the room's design events, filtered to a selected screen frame.
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000007";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const CONVERSATION_MESSAGE_BODY =
  "Let's map the plan-picking flow before we design it.";

// The minimal slice of the real tldraw Editor this spec drives through
// window.__MELD_TLDRAW_TRIAL_EDITOR__ (set in user-flow-trial-canvas.tsx's
// onMount when the trial is enabled). Declared locally rather than via a
// `declare global` augmentation so it can't conflict with the differently
// shaped ones e2e/user-flow-trial.spec.ts and
// e2e/design-sketch-generate.spec.ts already declare for this same window
// property.
type TrialShape = { id: string; type: string; meta: Record<string, unknown> };
type TrialEditor = {
  getCurrentPageShapes(): TrialShape[];
  select(...ids: string[]): unknown;
  selectNone(): unknown;
  zoomToSelection(): unknown;
};

// Every page.evaluate callback below is self-contained (only closes over
// `window` and its own arguments) -- page.evaluate serializes the function
// and runs it in the browser, which cannot see outer Node-scope bindings.

// The set of screen ids currently projected as canvas frames, so a freshly
// generated screen's frame can be identified by diffing this set before and
// after Generate -- its id isn't known ahead of time the way a fixture
// screen's is, because the composer creates it fresh through
// fakeGenerateDesignScreen.
async function frameScreenIds(page: Page): Promise<string[]> {
  return page.evaluate(() => {
    const editor = (
      window as unknown as { __MELD_TLDRAW_TRIAL_EDITOR__?: TrialEditor }
    ).__MELD_TLDRAW_TRIAL_EDITOR__;
    return (editor?.getCurrentPageShapes() ?? [])
      .filter((shape) => shape.type === "frame")
      .map((shape) => shape.meta.meldScreenId)
      .filter((id): id is string => typeof id === "string");
  });
}

// The PRD-seed effect draws the journey flow into its own frame and zooms
// the camera to fit it (flow-document-to-tldraw.ts's applyGeneratedFlow);
// the screen-seed effect's baseline-row placement is intentionally
// uncoordinated with that layout (a documented slice 3c follow-up), so the
// seeded screen frame can land outside the current view. Select it and zoom
// to it so its rendered frame heading is actually on screen, then clear the
// selection again so it doesn't affect what the test does next.
async function revealSeededScreenFrame(page: Page): Promise<void> {
  await page.evaluate(() => {
    const editor = (
      window as unknown as { __MELD_TLDRAW_TRIAL_EDITOR__?: TrialEditor }
    ).__MELD_TLDRAW_TRIAL_EDITOR__;
    if (!editor) return;
    const frame = editor
      .getCurrentPageShapes()
      .find(
        (shape) =>
          shape.type === "frame" && typeof shape.meta.meldScreenId === "string",
      );
    if (!frame) return;
    editor.select(frame.id);
    editor.zoomToSelection();
    editor.selectNone();
  });
}

test.beforeEach(async ({ context }) => {
  const appBaseUrl =
    `http://127.0.0.1:${process.env.MELD_CANVAS_E2E_APP_PORT ?? 18788}`;
  await context.addCookies([
    { name: "meld-e2e-user-id", value: OWNER_ID, url: appBaseUrl },
    {
      name: "meld-e2e-user-email",
      value: "owner@example.com",
      url: appBaseUrl,
    },
    {
      name: "meld-e2e-user-name",
      value: "Owner Example",
      url: appBaseUrl,
    },
  ]);
});

test("flow action nodes seed screen frames on the Canvas", async ({
  page,
}) => {
  const appBaseUrl =
    `http://127.0.0.1:${process.env.MELD_CANVAS_E2E_APP_PORT ?? 18788}`;
  const roomPath = `/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=user-flows`;
  await page.goto(new URL(roomPath, appBaseUrl).toString());

  await expect(page.getByTestId("user-flow-trial-canvas")).toBeVisible();

  // The PRD's journey flow carries exactly one action node, "Pick plan". The
  // canvas's auto-seed effect (planScreenSeeds + seedDesignScreensFromFlow)
  // plants an empty screen for it the first time an editor opens the canvas,
  // and the existing reconcile effect (slice 3a) projects that screen row as
  // a tldraw frame -- rendering its name in the frame's own heading.
  await expect
    .poll(() => frameScreenIds(page))
    .toEqual(expect.arrayContaining([expect.any(String)]));
  await revealSeededScreenFrame(page);
  await expect(
    page.locator(".tl-frame-label", { hasText: "Pick plan" }),
  ).toBeVisible();
});

test("History drawer shows generation events and filters to the selected screen", async ({
  page,
}) => {
  const appBaseUrl =
    `http://127.0.0.1:${process.env.MELD_CANVAS_E2E_APP_PORT ?? 18788}`;
  const roomPath = `/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=user-flows`;
  await page.goto(new URL(roomPath, appBaseUrl).toString());

  await expect(page.getByTestId("user-flow-trial-canvas")).toBeVisible();
  // Let the flow-seeded "Pick plan" screen land before capturing the
  // "before" frame set below, so it isn't mistaken for the screen Generate
  // is about to create.
  await expect
    .poll(() => frameScreenIds(page))
    .toEqual(expect.arrayContaining([expect.any(String)]));
  const beforeScreenIds = await frameScreenIds(page);

  const composer = page.getByTestId("screen-composer");
  await expect(composer).toBeVisible();
  const instructionField = composer.getByRole("textbox", {
    name: "Screen instruction",
  });
  const generateButton = composer.getByRole("button", { name: "Generate" });
  await instructionField.fill("A pricing screen with three tiers.");
  await generateButton.click();

  await expect(composer.getByText("Building screen")).toBeVisible();

  // The generated screen materializes on the canvas as its own frame, with a
  // sandboxed preview swapped in -- proof the fake generation completed and
  // (per the fake wiring mirrored in fakeListRoomTaskStatuses) recorded a
  // version_created design event for it.
  const previewTitle = "Screen canvas preview";
  await expect(page.getByTitle(previewTitle)).toBeAttached({
    timeout: 30_000,
  });

  const afterScreenIds = await frameScreenIds(page);
  const generatedScreenId = afterScreenIds.find(
    (id) => !beforeScreenIds.includes(id),
  );
  expect(generatedScreenId).toBeTruthy();

  // Open History: with nothing selected, the drawer shows the room's whole
  // unified feed -- the seeded conversation message alongside the
  // generation's design events.
  await page.getByRole("button", { name: /history/i }).click();
  const historyDrawer = page.getByTestId("history-drawer");
  await expect(historyDrawer).toBeVisible();
  // Both the queued-generation event ("Generating…") and the completed
  // version's event ("New version") are independent, append-only log
  // entries -- the fake mirrors materialize_design_screen_generate's
  // append_design_screen_event calls -- so both persist in the feed at
  // once. "New version" is the deterministic proof the fake generation
  // actually completed and recorded a version_created event.
  await expect(historyDrawer.getByText("New version")).toBeVisible();
  await expect(
    historyDrawer.getByText(CONVERSATION_MESSAGE_BODY),
  ).toBeVisible();

  // Select the generated screen's frame -- via the trial editor test handle,
  // the same programmatic path design-sketch-generate.spec.ts and
  // design-canvas.spec.ts drive the canvas through. The drawer filters to
  // that screen's own design events; the room-level conversation message,
  // which isn't screen-scoped, drops out.
  await page.evaluate((screenId) => {
    const editor = (
      window as unknown as { __MELD_TLDRAW_TRIAL_EDITOR__?: TrialEditor }
    ).__MELD_TLDRAW_TRIAL_EDITOR__;
    if (!editor) throw new Error("trial editor not mounted");
    const frame = editor
      .getCurrentPageShapes()
      .find(
        (shape) =>
          shape.type === "frame" && shape.meta.meldScreenId === screenId,
      );
    if (!frame) throw new Error("generated screen frame not found");
    editor.select(frame.id);
  }, generatedScreenId);

  // Both this screen's own events (generation_started + version_created)
  // survive the filter -- only the room-level conversation message drops.
  await expect(historyDrawer.getByText("New version")).toBeVisible();
  await expect(historyDrawer.getByText("Generating…")).toBeVisible();
  await expect(
    historyDrawer.getByText(CONVERSATION_MESSAGE_BODY),
  ).toHaveCount(0);

  // Deselecting (empty space) drops the screen filter -- the conversation
  // reappears.
  await page.evaluate(() => {
    const editor = (
      window as unknown as { __MELD_TLDRAW_TRIAL_EDITOR__?: TrialEditor }
    ).__MELD_TLDRAW_TRIAL_EDITOR__;
    if (!editor) throw new Error("trial editor not mounted");
    editor.selectNone();
  });

  await expect(
    historyDrawer.getByText(CONVERSATION_MESSAGE_BODY),
  ).toBeVisible();
});
