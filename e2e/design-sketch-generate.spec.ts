import { expect, test } from "@playwright/test";

// Fixtures from apps/web/src/features/rooms/e2e-fake.ts
// (E2E_DESIGN_SKETCH_ROOM_ID / E2E_DESIGN_SKETCH_SCREEN_ID): a Design-stage
// room with the User Flows canvas already started and exactly one unbuilt
// screen, so its single frame is the only thing on the canvas to draw
// inside of.
const WORKSPACE_ID = "00000000-0000-4000-8000-000000000001";
const ROOM_ID = "40000000-0000-4000-8000-000000000006";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";
const SCREEN_ID = "71000000-0000-4000-8000-000000000003";
const SCREEN_NAME = "Sketch layout screen";

// Two `geo` rectangles placed (in page space) inside the screen frame's
// bounds ({x:0,y:0,w:390,h:844} -- screenFrameRecord's fixed frame size at
// the fixture's canvasX/canvasY origin). Hand-picked so serializeSketch's
// third()/widthBucket()/heightBucket() buckets land, unambiguously, on two
// different positions: well inside the top-left ninth and the bottom-right
// ninth, both far from any bucket boundary.
const SKETCH_A = { id: "shape:e2e-sketch-a", x: 20, y: 20, w: 60, h: 40 };
const SKETCH_B = { id: "shape:e2e-sketch-b", x: 250, y: 700, w: 100, h: 100 };

// The minimal slice of the real tldraw Editor this spec drives through
// window.__MELD_TLDRAW_TRIAL_EDITOR__ (set in user-flow-trial-canvas.tsx's
// onMount when the trial is enabled). Declared locally rather than via a
// `declare global` augmentation so it can't conflict with the differently
// shaped one e2e/user-flow-trial.spec.ts already declares for this same
// window property.
type TrialShape = {
  id: string;
  type: string;
  meta: Record<string, unknown>;
  // Only the frame shape's `name` is read (Task 7's page-name relabel
  // assertion) -- every other prop tldraw's frame carries is irrelevant here.
  props?: { name?: string };
};
type TrialEditor = {
  getCurrentPageShapes(): TrialShape[];
  createShapes(shapes: Array<Record<string, unknown>>): unknown;
  select(...ids: string[]): unknown;
};

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

test("sketching inside a selected frame feeds the serialized layout into screen generation", async ({
  page,
}) => {
  const appBaseUrl =
    `http://127.0.0.1:${process.env.MELD_CANVAS_E2E_APP_PORT ?? 18788}`;
  const roomPath = `/${WORKSPACE_ID}/rooms/${ROOM_ID}?tab=user-flows`;
  await page.goto(new URL(roomPath, appBaseUrl).toString());

  await expect(page.getByTestId("user-flow-trial-canvas")).toBeVisible();

  // The room's single unbuilt screen reconciles onto the canvas as exactly
  // one frame carrying `meta.meldScreenId`.
  await expect
    .poll(() =>
      page.evaluate((screenId) => {
        const editor = (
          window as unknown as { __MELD_TLDRAW_TRIAL_EDITOR__?: TrialEditor }
        ).__MELD_TLDRAW_TRIAL_EDITOR__;
        return (
          editor
            ?.getCurrentPageShapes()
            .some(
              (shape) =>
                shape.type === "frame" && shape.meta.meldScreenId === screenId,
            ) ?? false
        );
      }, SCREEN_ID),
    )
    .toBe(true);

  // Draw two rectangles inside the frame's bounds and select the frame --
  // via the trial editor test handle (window.__MELD_TLDRAW_TRIAL_EDITOR__),
  // the same programmatic path e2e/user-flow-trial.spec.ts and
  // e2e/design-canvas.spec.ts drive the canvas through.
  await page.evaluate(
    ({ screenId, a, b }) => {
      const editor = (
        window as unknown as { __MELD_TLDRAW_TRIAL_EDITOR__?: TrialEditor }
      ).__MELD_TLDRAW_TRIAL_EDITOR__;
      if (!editor) throw new Error("trial editor not mounted");
      editor.createShapes([
        {
          id: a.id,
          type: "geo",
          x: a.x,
          y: a.y,
          props: { geo: "rectangle", w: a.w, h: a.h },
        },
        {
          id: b.id,
          type: "geo",
          x: b.x,
          y: b.y,
          props: { geo: "rectangle", w: b.w, h: b.h },
        },
      ]);
      const frame = editor
        .getCurrentPageShapes()
        .find(
          (shape) =>
            shape.type === "frame" && shape.meta.meldScreenId === screenId,
        );
      if (!frame) throw new Error("screen frame not found");
      editor.select(frame.id);
    },
    { screenId: SCREEN_ID, a: SKETCH_A, b: SKETCH_B },
  );

  const composer = page.getByTestId("screen-composer");
  await expect(composer).toBeVisible();
  // The sketch-aware composer's own affordance: it only shows once a
  // selected frame's contained sketch shapes are read back through the
  // canvas-selection bridge (Task 4) into the composer's `selection` prop
  // (Task 5). NOTE: the composer was rebuilt (Room stage #10, then the
  // multi-select fan-out work on this branch) after this text was first
  // written -- the sketch count is no longer its own "sketch: N shapes"
  // token, it's the endContent on the per-screen name chip
  // (screen-composer.tsx's `· following your sketch (N)`).
  await expect(composer.getByText(/following your sketch \(2\)/)).toBeVisible();

  // Also stale from the same rebuild: the field's accessible label is now
  // the shared composer prompt (COMPOSER_PROMPT in screen-composer.tsx), and
  // the send control's accessible name is "Send", not "Generate" -- there is
  // only one textbox in the composer, so an unscoped role query is enough.
  const instructionField = composer.getByRole("textbox");
  const generateButton = composer.getByRole("button", { name: "Send" });
  await instructionField.fill("A clean layout matching the sketch.");
  await generateButton.click();

  // Also stale: the in-flight reply's copy is now WaveText's "Designing
  // your screen…", not "Building screen".
  await expect(composer.getByText(/Designing your screen/)).toBeVisible();

  // The screen materializes on the canvas: the sandboxed preview iframe swaps
  // in, carrying the fake generation's rendered instruction -- which is only
  // able to contain the serialized box lines if Generate actually threaded
  // `serializeSketch(...)` + `formatSketchLayoutForPrompt(...)` through to the
  // instruction the (fake) connector received.
  const previewTitle = `${SCREEN_NAME} canvas preview`;
  const previewIframe = page.getByTitle(previewTitle);
  await expect(previewIframe).toBeAttached({
    timeout: 30_000,
  });
  const preview = page.frameLocator(`iframe[title="${previewTitle}"]`);
  const generatedText = await preview.locator("p").first().textContent();

  expect(generatedText).toContain("A clean layout matching the sketch.");
  // The two sketch rectangles' formatted box lines -- proof the serialized
  // layout (not just the typed instruction) reached the fake generation.
  expect(generatedText).toContain("- narrow rectangle at top-left");
  expect(generatedText).toContain("- narrow rectangle at bottom-right");

  // The workspace's active design profile (seeded in e2e-fake.ts for this
  // fixture workspace, Task 12) threads its component stylesheet into the
  // rendered doc through the same getActiveDesignProfile -> ScreenFrameOverlay
  // -> buildFramePreviewDoc path a real active profile would drive -- proof
  // the generated screen's canvas preview carries the distilled "button"
  // component's compiled CSS (`.ds-button{...}`), not just token CSS.
  const previewSrcDoc = await previewIframe.getAttribute("srcdoc");
  expect(previewSrcDoc).toContain("ds-button");

  // The materialized screen's frame reflects the canvas's live sync of the
  // screen's current name (not a stale/placeholder render): this fixture's
  // screen already had a real name before generation, so the completed
  // generation must not have reset it back to the raw "Screen" placeholder.
  // The multi-select test below exercises the *positive* half of this same
  // guard -- a screen that starts out actually named "Screen" relabels away
  // from it once its generation completes.
  await expect
    .poll(() =>
      page.evaluate((screenId) => {
        const editor = (
          window as unknown as { __MELD_TLDRAW_TRIAL_EDITOR__?: TrialEditor }
        ).__MELD_TLDRAW_TRIAL_EDITOR__;
        const frame = editor
          ?.getCurrentPageShapes()
          .find(
            (shape) =>
              shape.type === "frame" && shape.meta.meldScreenId === screenId,
          );
        return frame?.props?.name ?? null;
      }, SCREEN_ID),
    )
    .not.toBe("Screen");
});

// Fixtures from apps/web/src/features/rooms/e2e-fake.ts
// (E2E_DESIGN_MULTISELECT_ROOM_ID / _SCREEN_A_ID / _SCREEN_B_ID): a second
// Design-stage room, seeded with two unbuilt screens side by side so this
// spec has two frames to select at once. Screen A still carries the exact
// default placeholder name ("Screen"); Screen B already has a real one
// ("Sign in") -- between the two, a completed generation's placeholder-name
// guard (Task 1) gets exercised in both directions.
const MULTI_ROOM_ID = "40000000-0000-4000-8000-00000000000c";
const MULTI_SCREEN_A_ID = "71000000-0000-4000-8000-000000000006";
const MULTI_SCREEN_B_ID = "71000000-0000-4000-8000-000000000007";
const MULTI_SCREEN_B_NAME = "Sign in";
// The fake's deterministic generated name (e2e-fake.ts's
// FAKE_GENERATED_SCREEN_NAME) -- what a completed generation renames a
// "Screen"-placeholder screen to.
const FAKE_GENERATED_SCREEN_NAME = "Vehicle Pool";

test("selecting multiple frames shows a removable chip per screen and fans out one generation per screen", async ({
  page,
}) => {
  const appBaseUrl =
    `http://127.0.0.1:${process.env.MELD_CANVAS_E2E_APP_PORT ?? 18788}`;
  const roomPath = `/${WORKSPACE_ID}/rooms/${MULTI_ROOM_ID}?tab=user-flows`;
  await page.goto(new URL(roomPath, appBaseUrl).toString());

  await expect(page.getByTestId("user-flow-trial-canvas")).toBeVisible();

  // Both fixture screens reconcile onto the canvas as their own frame --
  // same wiring the single-screen test above already proves, just for two
  // screens instead of one.
  await expect
    .poll(() =>
      page.evaluate(
        ({ a, b }) => {
          const editor = (
            window as unknown as { __MELD_TLDRAW_TRIAL_EDITOR__?: TrialEditor }
          ).__MELD_TLDRAW_TRIAL_EDITOR__;
          const shapes = editor?.getCurrentPageShapes() ?? [];
          const hasFrame = (id: string) =>
            shapes.some(
              (shape) => shape.type === "frame" && shape.meta.meldScreenId === id,
            );
          return hasFrame(a) && hasFrame(b);
        },
        { a: MULTI_SCREEN_A_ID, b: MULTI_SCREEN_B_ID },
      ),
    )
    .toBe(true);

  // Select both frames at once through the trial editor test handle -- the
  // canvas-selection bridge (Task 4) is what turns this into the composer's
  // two-entry `selection` prop.
  await page.evaluate(
    ({ a, b }) => {
      const editor = (
        window as unknown as { __MELD_TLDRAW_TRIAL_EDITOR__?: TrialEditor }
      ).__MELD_TLDRAW_TRIAL_EDITOR__;
      if (!editor) throw new Error("trial editor not mounted");
      const shapes = editor.getCurrentPageShapes();
      const frameA = shapes.find(
        (shape) => shape.type === "frame" && shape.meta.meldScreenId === a,
      );
      const frameB = shapes.find(
        (shape) => shape.type === "frame" && shape.meta.meldScreenId === b,
      );
      if (!frameA || !frameB) throw new Error("screen frames not found");
      editor.select(frameA.id, frameB.id);
    },
    { a: MULTI_SCREEN_A_ID, b: MULTI_SCREEN_B_ID },
  );

  const composer = page.getByTestId("screen-composer");
  await expect(composer).toBeVisible();

  // One removable chip per selected screen, labelled by the screen's own
  // name -- screen-composer.tsx renders `<Token label={screenNameById.get(
  // t.targetScreenId) ?? "Screen"} .../>` per targeted screen, NOT an
  // "Editing: <name>" token (the sdd brief's assumed format, written before
  // this composer existed).
  await expect(composer.getByText("Screen", { exact: true })).toBeVisible();
  await expect(
    composer.getByText(MULTI_SCREEN_B_NAME, { exact: true }),
  ).toBeVisible();

  const instructionField = composer.getByRole("textbox");
  const sendButton = composer.getByRole("button", { name: "Send" });
  await instructionField.fill("A clean layout for both screens.");
  await sendButton.click();

  // The fan-out queues one optimistic turn per targeted screen (screen-
  // composer.tsx's buildFanOutSubmission), so two building replies show up,
  // not one -- proof generation.startMany actually fanned out per-screen
  // rather than collapsing the selection into a single generation.
  await expect(
    composer.locator('[data-testid^="agents-turn-reply-"]'),
  ).toHaveCount(2);
  await expect(composer.getByText(/Designing your screen/).first()).toBeVisible();

  // Both screens materialize into their own preview iframe -- two built
  // replies, one per fanned-out task.
  await expect(
    page.getByTitle(`${FAKE_GENERATED_SCREEN_NAME} canvas preview`),
  ).toBeAttached({ timeout: 30_000 });
  await expect(
    page.getByTitle(`${MULTI_SCREEN_B_NAME} canvas preview`),
  ).toBeAttached({ timeout: 30_000 });

  // Screen A started out actually named "Screen" -- its completed
  // generation relabels the frame away from the placeholder (mirroring
  // materialize_design_screen_generate's real guard, Task 1's fake mirror of
  // it). Screen B already had a real name and keeps it (asserted by the
  // preview title above still reading "Sign in canvas preview", not
  // something else).
  await expect
    .poll(() =>
      page.evaluate((screenId) => {
        const editor = (
          window as unknown as { __MELD_TLDRAW_TRIAL_EDITOR__?: TrialEditor }
        ).__MELD_TLDRAW_TRIAL_EDITOR__;
        const frame = editor
          ?.getCurrentPageShapes()
          .find(
            (shape) =>
              shape.type === "frame" && shape.meta.meldScreenId === screenId,
          );
        return frame?.props?.name ?? null;
      }, MULTI_SCREEN_A_ID),
    )
    .not.toBe("Screen");
});
