import { test, expect } from "@playwright/test";

test("a sketch inside a frame becomes a live screen beside it", async ({ page }) => {
  await page.goto("/dev/canvas-excalidraw");
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  // Draw a frame with a rectangle in it through the scene API.
  await page.evaluate(() => {
    const { api, convert } = window.__orionBoard!;
    const elements = convert([
      { type: "rectangle", id: "box", x: 40, y: 40, width: 200, height: 60 },
      { type: "frame", id: "sketch", x: 0, y: 0, width: 400, height: 500, children: ["box"] },
    ]);
    api.updateScene({ elements });
    // convert() assigns fresh ids, so select the frame by looking it up.
    const frame = elements.find((element) => element.type === "frame")!;
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
  });
  await expect(page.getByRole("button", { name: "Build screen" })).toBeEnabled();
  await page.getByRole("button", { name: "Build screen" }).click();
  const generated = page.locator('iframe[data-orion-frame^="generated-"]');
  await expect(generated).toBeVisible();
  await expect(page.frameLocator('iframe[data-orion-frame^="generated-"]').getByRole("heading", { name: "Generated screen" })).toBeVisible();
});

test("two rapid clicks on Build screen make exactly one screen", async ({ page }) => {
  await page.goto("/dev/canvas-excalidraw");
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.evaluate(() => {
    const { api, convert } = window.__orionBoard!;
    const elements = convert([
      { type: "rectangle", id: "box", x: 40, y: 40, width: 200, height: 60 },
      { type: "frame", id: "sketch", x: 0, y: 0, width: 400, height: 500, children: ["box"] },
    ]);
    api.updateScene({ elements });
    const frame = elements.find((element) => element.type === "frame")!;
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
  });
  // Hold the reply so the in-progress state can be observed.
  let release!: () => void;
  const gate = new Promise<void>((resolve) => { release = resolve; });
  let calls = 0;
  await page.route("**/api/dev/canvas-excalidraw/generate", async (route) => {
    calls += 1;
    await gate;
    await route.continue();
  });
  const build = page.getByRole("button", { name: "Build screen" });
  await expect(build).toBeEnabled();
  await build.click();
  await build.click({ force: true });
  await expect(build).toBeDisabled();
  await expect(page.getByText("Building screen…")).toBeVisible();
  release();
  const generated = page.locator('iframe[data-orion-frame^="generated-"]');
  await expect(generated).toBeVisible();
  await expect(build).toBeEnabled();
  await expect(generated).toHaveCount(1);
  expect(calls).toBe(1);
});
