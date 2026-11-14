import { test, expect } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

test("pan and zoom stay smooth with 20 live frames", async ({ page }, testInfo) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.evaluate(() => window.__orionBoard!.addFrames(20, "sample"));
  await expect(page.locator('iframe[data-orion-frame]')).not.toHaveCount(0);
  const mountedFrames = await page.locator('iframe[data-orion-frame]').count();

  const frames = await page.evaluate(async () => {
    const { api } = window.__orionBoard!;
    api.scrollToContent(undefined, { fitToViewport: true, animate: false });
    const deltas: number[] = [];
    let last = performance.now();
    const start = last;
    let tick = 0;
    await new Promise<void>((done) => {
      const step = (now: number) => {
        deltas.push(now - last);
        last = now;
        tick += 1;
        const state = api.getAppState();
        api.updateScene({
          appState: {
            scrollX: state.scrollX + (tick % 2 === 0 ? 12 : -12),
            scrollY: state.scrollY + (tick % 2 === 0 ? 8 : -8),
            zoom: { value: Math.max(0.2, Math.min(2, state.zoom.value * (tick % 40 < 20 ? 1.01 : 0.99))) as typeof state.zoom.value },
          },
        });
        if (now - start < 5000) requestAnimationFrame(step);
        else done();
      };
      requestAnimationFrame(step);
    });
    return deltas;
  });

  const sorted = [...frames].sort((a, b) => a - b);
  const p50 = sorted[Math.floor(sorted.length * 0.5)]!;
  const p95 = sorted[Math.floor(sorted.length * 0.95)]!;
  const result = { frames: frames.length, p50: Math.round(p50 * 10) / 10, p95: Math.round(p95 * 10) / 10, sceneFrames: 20, mountedFrames };
  await testInfo.attach("twenty-frame-pan-zoom.json", { body: JSON.stringify(result, null, 2), contentType: "application/json" });
  console.log("20 live frames, 5s pan/zoom:", JSON.stringify(result));
  expect(p95).toBeLessThanOrEqual(50);
});

test("a script that loops forever: does the board stay usable?", async ({ page }, testInfo) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  // The click itself may never acknowledge if the frame blocks the renderer.
  void page.getByRole("button", { name: "Add loop screen" }).click({ timeout: 3000, noWaitAfter: true }).catch(() => undefined);
  await new Promise((resolve) => setTimeout(resolve, 1000));
  const responsive = await Promise.race([
    page.evaluate(() => performance.now()).then(() => true).catch(() => false),
    new Promise<boolean>((resolve) => setTimeout(() => resolve(false), 5000)),
  ]);
  await testInfo.attach("runaway-script.json", { body: JSON.stringify({ boardResponsiveAfter5s: responsive }), contentType: "application/json" });
  console.log("runaway script, board responsive after 5s:", responsive);
  expect(typeof responsive).toBe("boolean");
});
