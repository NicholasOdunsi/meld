import { expect, test } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

test("Excalidraw's own UI is hidden and Orion's dock drives the tools", async ({ page }) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  for (const selector of [".App-toolbar-container", ".App-menu__left", ".layer-ui__wrapper__top-right", ".HintViewer", ".layer-ui__wrapper__footer", ".main-menu-trigger"]) {
    // Hidden by CSS: the elements may exist, but none may be visible.
    const matches = page.locator(selector);
    for (let index = 0; index < (await matches.count()); index += 1) await expect(matches.nth(index)).toBeHidden();
  }
  const dock = page.getByTestId("canvas-dock");
  await expect(dock).toBeVisible();
  // The dock floats above the board with a soft shadow and a filled body.
  expect(await dock.evaluate((element) => getComputedStyle(element).boxShadow)).not.toBe("none");
  expect(await dock.evaluate((element) => getComputedStyle(element).backgroundColor)).not.toBe("rgba(0, 0, 0, 0)");
  // Rectangle, ellipse and arrow sit behind the one Shapes button.
  await expect(dock.getByRole("button", { name: "Rectangle" })).toHaveCount(0);
  await dock.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();
  expect(await page.evaluate(() => window.__orionBoard?.api.getAppState().activeTool.type)).toBe("rectangle");
});

test("drawing a rectangle shows the pill and recolours it", async ({ page }) => {
  await page.goto(route);
  const canvas = page.locator("canvas.excalidraw__canvas").last();
  await expect(canvas).toBeVisible();
  await page.getByTestId("canvas-dock").getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 400);
  await page.mouse.up();
  const pill = page.getByTestId("selection-pill");
  await expect(pill).toBeVisible();
  await pill.getByRole("button", { name: "Bold" }).click();
  expect(await page.evaluate(() => window.__orionBoard?.api.getSceneElements().at(-1)?.strokeWidth)).toBe(4);
});

test("zoom control zooms in", async ({ page }) => {
  await page.goto(route);
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(await page.evaluate(() => window.__orionBoard?.api.getAppState().zoom.value)).toBeCloseTo(1.25);
});

test("selecting a screen does not open Excalidraw's link popup", async ({ page }) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.evaluate(() => window.__orionBoard!.addFixture("sample"));
  const thumbnail = page.locator('iframe[data-orion-frame="welcome"]');
  await expect(thumbnail).toBeVisible();
  const box = (await thumbnail.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect(page.getByTestId("selection-pill")).toBeVisible();
  // Hidden by CSS: the popup may exist in the page, but must not be visible.
  const popup = page.locator(".excalidraw-hyperlinkContainer");
  for (let index = 0; index < (await popup.count()); index += 1) await expect(popup.nth(index)).toBeHidden();
});

test("the Shapes menu offers line and diamond as tools and drops in a triangle", async ({ page }) => {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  const dock = page.getByTestId("canvas-dock");
  const tool = () => page.evaluate(() => window.__orionBoard!.api.getAppState().activeTool.type);
  await dock.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Line" }).click();
  expect(await tool()).toBe("line");
  await dock.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Diamond" }).click();
  expect(await tool()).toBe("diamond");
  await dock.getByRole("button", { name: "Shapes" }).click();
  const problems: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
  page.on("pageerror", (error) => problems.push(String(error)));
  await page.getByRole("button", { name: "Triangle" }).click();
  const triangle = await page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const selected = api.getAppState().selectedElementIds;
    const element = api.getSceneElements().find((candidate) => selected[candidate.id]);
    return element && element.type === "line" ? { type: element.type, points: element.points.length } : null;
  });
  // A closed outline: three corners plus the return to the start.
  expect(triangle).toEqual({ type: "line", points: 4 });
  // Selecting a line by clicking it starts Excalidraw's line editor, which logs
  // "Linear element is not normalized" for a line whose first point isn't [0, 0].
  const canvasBox = (await page.locator("canvas.excalidraw__canvas").last().boundingBox())!;
  await page.mouse.click(canvasBox.x + 5, canvasBox.y + 5);
  const bottomEdge = await page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const view = api.getAppState();
    const line = api.getSceneElements().find((candidate) => candidate.type === "line");
    if (!line || line.type !== "line") return null;
    const xs = line.points.map((point) => point[0]);
    const ys = line.points.map((point) => point[1]);
    return {
      x: (line.x + (Math.min(...xs) + Math.max(...xs)) / 2 + view.scrollX) * view.zoom.value,
      y: (line.y + Math.max(...ys) + view.scrollY) * view.zoom.value,
      width: line.width,
      height: line.height,
      spanX: Math.max(...xs) - Math.min(...xs),
      spanY: Math.max(...ys) - Math.min(...ys),
    };
  });
  expect(bottomEdge).not.toBeNull();
  // The element's size matches the outline it draws.
  expect({ width: bottomEdge!.width, height: bottomEdge!.height }).toEqual({ width: bottomEdge!.spanX, height: bottomEdge!.spanY });
  await page.mouse.click(canvasBox.x + bottomEdge!.x, canvasBox.y + bottomEdge!.y);
  await page.keyboard.press("ControlOrMeta+z");
  await page.keyboard.press("ControlOrMeta+Shift+z");
  expect(problems.filter((text) => text.includes("not normalized"))).toEqual([]);
});
