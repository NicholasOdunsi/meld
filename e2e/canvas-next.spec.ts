import { test, expect, type Page } from "@playwright/test";

const route = "/dev/canvas-next";
// The prototype is laid out for a desktop window; at the default 1280x720 the
// lower-right resize handle sits below the fold.
test.use({ viewport: { width: 1600, height: 1000 } });
async function sceneBounds(page: Page) {
  const bounds = await page.getByRole("application", {name: "Canvas workspace"}).boundingBox();
  if (!bounds) throw new Error("Canvas has no bounds");
  return bounds;
}
async function drag(page: Page, from: [number, number], to: [number, number]) {
  const box = await sceneBounds(page);
  await page.mouse.move(box.x+from[0], box.y+from[1]); await page.mouse.down();
  await page.mouse.move(box.x+to[0], box.y+to[1], {steps: 8}); await page.mouse.up();
}
async function importDocument(page: Page, document: unknown) {
  await page.locator('input[type="file"]').setInputFiles({name: "canvas.json", mimeType: "application/json", buffer: Buffer.from(JSON.stringify(document))});
}
async function exportedDocument(page: Page) {
  const download = page.waitForEvent("download");
  await page.getByRole("button", {name: "Export canvas"}).click();
  const file = await download;
  const stream = await file.createReadStream();
  const chunks: Buffer[] = [];
  for await (const chunk of stream!) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString());
}

test("draws, manipulates, edits notes, exports and reopens without tldraw", async ({page}) => {
  const requests: string[] = [], errors: string[] = [];
  page.on("request", request => requests.push(request.url()));
  page.on("pageerror", error => errors.push(error.message));
  await page.goto(route);
  const scene = page.getByRole("application", {name: "Canvas workspace"});
  await expect(page.getByText("Local prototype — export to keep your work")).toBeVisible();
  await expect(scene).toHaveAttribute("data-object-count", "7");
  await expect(page.frameLocator('iframe[title="Your next idea preview"]').getByRole("heading", {name: "A little space for your next idea."})).toBeVisible();
  await expect(page.locator("iframe")).toHaveAttribute("sandbox", "");
  const previewBody = page.frameLocator('iframe[title="Your next idea preview"]').locator("body");
  const scriptExecuted = await previewBody.evaluate(body => {
    const script = body.ownerDocument.createElement("script");
    script.textContent = 'document.body.dataset.scriptExecuted="yes"';
    body.appendChild(script);
    return body.getAttribute("data-script-executed");
  });
  expect(scriptExecuted).toBeNull();
  await page.screenshot({path: "test-results/canvas-next-initial.png", fullPage: true});
  await page.getByRole("button", {name: "Rectangle", exact: true}).click();
  await drag(page, [1000, 120], [1200, 260]);
  await expect(scene).toHaveAttribute("data-object-count", "8");
  await page.getByRole("button", {name: "Draw", exact: true}).click();
  await drag(page, [1000, 320], [1200, 400]);
  await expect(scene).toHaveAttribute("data-object-count", "9");
  await page.getByRole("button", {name: "Undo", exact: true}).click();
  await expect(scene).toHaveAttribute("data-object-count", "8");
  await page.getByRole("button", {name: "Redo", exact: true}).click();
  await expect(scene).toHaveAttribute("data-object-count", "9");
  await page.getByRole("button", {name: "Text", exact: true}).click();
  const box = await sceneBounds(page);
  await page.mouse.click(box.x+1000, box.y+450);
  await page.getByRole("textbox", {name: "Note text"}).fill("My canvas idea");
  await page.getByRole("textbox", {name: "Note text"}).press("Enter");
  await expect(scene).toHaveAttribute("data-object-count", "10");
  await page.getByRole("button", {name: "Select", exact: true}).click();
  await drag(page, [600, 100], [650, 150]);
  const handle = page.locator('[data-resize-id="screen"]');
  const h = await handle.boundingBox();
  if (!h) throw new Error("Resize handle missing");
  await page.mouse.move(h.x+h.width/2, h.y+h.height/2); await page.mouse.down();
  await page.mouse.move(h.x+65, h.y+45, {steps: 8}); await page.mouse.up();
  const doc = await exportedDocument(page);
  expect(doc.objects.find((o: {id: string}) => o.id === "screen")).toMatchObject({x: 510, y: 110});
  expect(doc.objects.find((o: {id: string}) => o.id === "screen").width).toBeGreaterThan(480);
  expect(doc.objects.some((o: {text?: string}) => o.text === "My canvas idea")).toBe(true);
  await page.reload();
  await expect(scene).toHaveAttribute("data-object-count", "7");
  await importDocument(page, doc);
  await expect(scene).toHaveAttribute("data-object-count", "10");
  expect(await exportedDocument(page)).toEqual(doc);
  expect(requests.some(url => url.includes("/api/canvas-session") || url.includes("tldraw"))).toBe(false);
  const scriptUrls = [...new Set(requests.filter(url => url.includes("/_next/static/") && url.endsWith(".js")))];
  for (const url of scriptUrls) {
    const source = await (await page.request.get(url)).text();
    expect(source).not.toMatch(/node_modules\/(?:\.pnpm\/)?(?:tldraw|@tldraw)/);
  }
  expect(errors).toEqual([]);
  await page.screenshot({path: "test-results/canvas-next.png", fullPage: true});
});

test("preserves the pointer anchor, cancellation, and failed imports", async ({page}) => {
  await page.goto(route);
  const scene = page.getByRole("application", {name: "Canvas workspace"});
  const box = await sceneBounds(page);
  const before = await page.locator('[data-object-id="idea"]').boundingBox();
  await page.mouse.move(box.x+60, box.y+60);
  await page.keyboard.down("Control"); await page.mouse.wheel(0, -120); await page.keyboard.up("Control");
  await expect.poll(async () => Number(await scene.getAttribute("data-zoom"))).toBeGreaterThan(1);
  const after = await page.locator('[data-object-id="idea"]').boundingBox();
  expect(Math.abs(before!.x-after!.x)).toBeLessThan(1);
  expect(Math.abs(before!.y-after!.y)).toBeLessThan(1);
  await page.getByRole("button", {name: "Rectangle", exact: true}).click();
  await page.mouse.move(box.x+1000, box.y+300); await page.mouse.down();
  await page.mouse.move(box.x+1100, box.y+400); await page.keyboard.press("Escape"); await page.mouse.up();
  await expect(scene).toHaveAttribute("data-object-count", "7");
  await importDocument(page, {version: 42, objects: []});
  await expect(page.getByRole("status", {name: "Canvas status"})).toContainText("Your board is unchanged");
  await expect(scene).toHaveAttribute("data-object-count", "7");
});

test("keeps upper objects above HTML frames and reports missing references", async ({page}) => {
  await page.goto(route);
  await importDocument(page, {version: 1, objects: [
    {id: "frame", kind: "html-frame", x: 10, y: 10, width: 480, height: 580, screenId: "11111111-1111-4111-8111-111111111111"},
    {id: "top", kind: "text", x: 30, y: 30, width: 200, height: 60, text: "Above preview"},
    {id: "missing", kind: "image", x: 600, y: 30, width: 200, height: 60, assetId: "https://untrusted.test/a.png"},
  ]});
  await expect(page.getByText("Image asset unavailable")).toBeVisible();
  await expect(page.getByText("Above preview")).toBeVisible();
  const box = await sceneBounds(page);
  await page.mouse.click(box.x+40, box.y+40);
  await expect(page.locator('[data-resize-id="top"]')).toBeVisible();
});

test("measures 1000 objects during 30 seconds of pan and zoom", async ({page}, testInfo) => {
  await page.goto(route);
  await importDocument(page, {version: 1, objects: Array.from({length: 1000}, (_, i) => ({
    id: `shape-${i}`, kind: "rectangle", x: (i%40)*100, y: Math.floor(i/40)*100, width: 80, height: 60,
  }))});
  const scene = page.getByRole("application", {name: "Canvas workspace"});
  await expect(scene).toHaveAttribute("data-object-count", "1000");
  const results = await scene.evaluate(async element => {
    const samples: number[] = []; let previous = performance.now(); const start = previous;
    await new Promise<void>(resolve => {
      function frame(now: number) {
        samples.push(now-previous); previous = now;
        const elapsed = now-start;
        element.dispatchEvent(new WheelEvent("wheel", {deltaX: Math.sin(elapsed/1000)*3, deltaY: Math.cos(elapsed/1000)*3, bubbles: true, cancelable: true}));
        if (samples.length%30 === 0) element.dispatchEvent(new WheelEvent("wheel", {ctrlKey: true, clientX: 600, clientY: 400, deltaY: Math.sin(elapsed/1000)*20, bubbles: true, cancelable: true}));
        if (elapsed < 30000) requestAnimationFrame(frame); else resolve();
      }
      requestAnimationFrame(frame);
    });
    samples.sort((a, b) => a-b);
    return {p50: samples[Math.floor(samples.length*.5)], p95: samples[Math.floor(samples.length*.95)],
      frames: samples.length, visible: element.getAttribute("data-visible-count"), userAgent: navigator.userAgent};
  });
  await testInfo.attach("canvas-performance.json", {body: JSON.stringify(results, null, 2), contentType: "application/json"});
  console.log("Canvas performance", JSON.stringify(results));
  // Chromium's 30 fps frame interval is about 33.33 ms and can be reported
  // as 33.4 ms on CI. Allow the timer's tenth-millisecond rounding.
  expect(results.p95).toBeLessThanOrEqual(34);
});
