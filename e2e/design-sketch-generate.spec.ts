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
type TrialShape = { id: string; type: string; meta: Record<string, unknown> };
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
  // (Task 5).
  await expect(composer.getByText(/sketch: 2 shapes/)).toBeVisible();

  const instructionField = composer.getByRole("textbox", {
    name: "Screen instruction",
  });
  const generateButton = composer.getByRole("button", { name: "Generate" });
  await instructionField.fill("A clean layout matching the sketch.");
  await generateButton.click();

  await expect(composer.getByText("Building screen")).toBeVisible();

  // The screen materializes on the canvas: the sandboxed preview iframe swaps
  // in, carrying the fake generation's rendered instruction -- which is only
  // able to contain the serialized box lines if Generate actually threaded
  // `serializeSketch(...)` + `formatSketchLayoutForPrompt(...)` through to the
  // instruction the (fake) connector received.
  const previewTitle = `${SCREEN_NAME} canvas preview`;
  await expect(page.getByTitle(previewTitle)).toBeAttached({
    timeout: 30_000,
  });
  const preview = page.frameLocator(`iframe[title="${previewTitle}"]`);
  const generatedText = await preview.locator("p").first().textContent();

  expect(generatedText).toContain("A clean layout matching the sketch.");
  // The two sketch rectangles' formatted box lines -- proof the serialized
  // layout (not just the typed instruction) reached the fake generation.
  expect(generatedText).toContain("- narrow rectangle at top-left");
  expect(generatedText).toContain("- narrow rectangle at bottom-right");
});
