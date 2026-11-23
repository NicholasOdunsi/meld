import { expect, test, type Page } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus)
    await page
      .screenshot({ path: `.context/fu-zoom-fail-${testInfo.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 80)}.png` })
      .catch(() => {});
});

async function wakeSample(page: Page) {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.evaluate(() => window.__orionBoard!.addFixture("sample"));
  const thumbnail = page.locator('iframe[data-orion-frame="welcome"]');
  await expect(thumbnail).toBeVisible();
  const box = (await thumbnail.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
  const live = page.locator('iframe[data-orion-live="welcome"]');
  await expect(live).toBeVisible();
  await expect(page.frameLocator('iframe[data-orion-live="welcome"]').getByText("script ran")).toBeVisible();
  // A lab screen opens its Code panel, which narrows the board.
  await expect(page.getByTestId("live-panel")).toBeVisible();
  await expect.poll(() => page.evaluate(() => window.__orionBoard!.api.getAppState().width)).toBeLessThan(1440);
  return live;
}

const appState = (page: Page) =>
  page.evaluate(() => {
    const state = window.__orionBoard!.api.getAppState();
    return { zoom: state.zoom.value, scrollX: state.scrollX, scrollY: state.scrollY, width: state.width, height: state.height, offsetLeft: state.offsetLeft, offsetTop: state.offsetTop };
  });

// Where the screen frame sits on the page, from the scene (not from the iframe).
const frameCentre = (page: Page) =>
  page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const state = api.getAppState();
    const frame = api.getSceneElements().find((element) => element.type === "embeddable")!;
    return {
      x: (frame.x + frame.width / 2 + state.scrollX) * state.zoom.value + state.offsetLeft,
      y: (frame.y + frame.height / 2 + state.scrollY) * state.zoom.value + state.offsetTop,
    };
  });

const centreOf = (box: { x: number; y: number; width: number; height: number }) => ({ x: box.x + box.width / 2, y: box.y + box.height / 2 });

async function selectScreen(page: Page) {
  await page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const frame = api.getSceneElements().find((element) => element.type === "embeddable")!;
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
  });
}

const zoomLabel = (page: Page) => page.locator('[aria-live="polite"]').filter({ hasText: /^\d+%$/ });

test("with a screen selected and the panel open, + zooms about the screen, and the frame, iframe and pill stay together", async ({ page }) => {
  const live = await wakeSample(page);
  await selectScreen(page);
  const pill = page.getByTestId("selection-pill");
  await expect(pill).toBeVisible();
  const start = await frameCentre(page);
  await page.screenshot({ path: ".context/fu-zoom-1-selected-before.png" });
  for (let step = 0; step < 3; step += 1) {
    const before = (await appState(page)).zoom;
    await page.getByRole("button", { name: "Zoom in" }).click();
    await expect.poll(async () => (await appState(page)).zoom).toBeGreaterThan(before);
    const centre = await frameCentre(page);
    expect(Math.abs(centre.x - start.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(centre.y - start.y)).toBeLessThanOrEqual(1);
    // The live iframe is drawn exactly over its frame.
    await expect.poll(async () => {
      const box = centreOf((await live.boundingBox())!);
      return Math.max(Math.abs(box.x - centre.x), Math.abs(box.y - centre.y));
    }).toBeLessThanOrEqual(1);
    // The pill stays centred under the frame.
    await expect.poll(async () => Math.abs(centreOf((await pill.boundingBox())!).x - centre.x)).toBeLessThanOrEqual(1);
    await expect(zoomLabel(page)).toHaveText(`${Math.round((await appState(page)).zoom * 100)}%`);
  }
  await page.screenshot({ path: ".context/fu-zoom-2-selected-after-3x.png" });
});

test("with an awake screen and nothing selected, the buttons zoom about the awake screen", async ({ page }) => {
  await wakeSample(page);
  await page.evaluate(() => window.__orionBoard!.api.updateScene({ appState: { selectedElementIds: {} } }));
  const start = await frameCentre(page);
  for (const name of ["Zoom in", "Zoom in", "Zoom out"]) {
    const before = (await appState(page)).zoom;
    await page.getByRole("button", { name }).click();
    await expect.poll(async () => (await appState(page)).zoom).not.toBe(before);
    const centre = await frameCentre(page);
    expect(Math.abs(centre.x - start.x)).toBeLessThanOrEqual(1);
    expect(Math.abs(centre.y - start.y)).toBeLessThanOrEqual(1);
  }
});

test("with nothing awake or selected, the buttons zoom about the centre of the visible board", async ({ page }) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  const sceneAtCentre = (state: Awaited<ReturnType<typeof appState>>) => ({
    x: state.width / 2 / state.zoom - state.scrollX,
    y: state.height / 2 / state.zoom - state.scrollY,
  });
  const before = sceneAtCentre(await appState(page));
  await page.getByRole("button", { name: "Zoom in" }).click();
  await expect.poll(async () => (await appState(page)).zoom).toBeGreaterThan(1);
  const after = sceneAtCentre(await appState(page));
  expect(after.x).toBeCloseTo(before.x, 3);
  expect(after.y).toBeCloseTo(before.y, 3);
});

test("ctrl+wheel (a pinch) over the awake screen zooms the board about the cursor without page zoom; a plain wheel does not zoom", async ({ page }) => {
  const live = await wakeSample(page);
  // The screen's own listener runs after the bridge's, so it sees whether the page zoom was stopped.
  const frame = (await (await live.elementHandle())!.contentFrame())!;
  await frame.evaluate(() => {
    const seen: boolean[] = [];
    (window as unknown as { __seen: boolean[] }).__seen = seen;
    window.addEventListener("wheel", (event) => { if (event.ctrlKey) seen.push(event.defaultPrevented); }, { passive: true });
  });
  const box = (await live.boundingBox())!;
  const cursor = { x: box.x + box.width * 0.3, y: box.y + box.height * 0.4 };
  await page.mouse.move(cursor.x, cursor.y);

  const before = await appState(page);
  const sceneUnder = (state: typeof before) => ({
    x: (cursor.x - state.offsetLeft) / state.zoom - state.scrollX,
    y: (cursor.y - state.offsetTop) / state.zoom - state.scrollY,
  });
  await page.mouse.wheel(0, 40);
  await page.waitForTimeout(300);
  expect((await appState(page)).zoom).toBe(before.zoom);

  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await appState(page)).zoom).toBeGreaterThan(before.zoom);
  const after = await appState(page);
  // Excalidraw's own ctrl+wheel step: 10% at most per event (below 100%).
  expect(after.zoom).toBeCloseTo(Math.min(30, before.zoom + 0.1 + Math.log10(Math.max(1, before.zoom))), 5);
  await expect(zoomLabel(page)).toHaveText(`${Math.round(after.zoom * 100)}%`);
  const fixed = sceneUnder(before), now = sceneUnder(after);
  expect(Math.abs((now.x - fixed.x) * after.zoom)).toBeLessThanOrEqual(1);
  expect(Math.abs((now.y - fixed.y) * after.zoom)).toBeLessThanOrEqual(1);
  expect(await frame.evaluate(() => (window as unknown as { __seen: boolean[] }).__seen)).toEqual([true]);
  await expect(page.locator('iframe[data-orion-live="welcome"]')).toBeVisible();

  // Over empty board the same gesture still zooms (Excalidraw's own handler).
  const canvas = (await page.locator("canvas.excalidraw__canvas").last().boundingBox())!;
  await page.mouse.move(canvas.x + 40, canvas.y + canvas.height - 40);
  const outside = (await appState(page)).zoom;
  await page.keyboard.down("Control");
  await page.mouse.wheel(0, -100);
  await page.keyboard.up("Control");
  await expect.poll(async () => (await appState(page)).zoom).toBeGreaterThan(outside);
});
