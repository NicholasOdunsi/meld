import { expect, test, type Page } from "@playwright/test";

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

test("drawing a rectangle opens its property panel, which sets the thickness", async ({ page }) => {
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
  const panel = page.getByTestId("shape-panel");
  await expect(panel).toBeVisible();
  await expect(page.getByTestId("selection-pill")).toHaveCount(0);
  const thickness = panel.getByRole("textbox", { name: "Thickness", exact: true });
  await thickness.fill("4");
  await thickness.press("Enter");
  expect(await page.evaluate(() => window.__orionBoard?.api.getSceneElements().at(-1)?.strokeWidth)).toBe(4);
});

test("the shape panel has no tabs or title, replaces the old Thin/Bold bar, and edits fill, stroke, style, thickness and opacity on the element", async ({ page }) => {
  await page.goto(route);
  const canvas = page.locator("canvas.excalidraw__canvas").last();
  await expect(canvas).toBeVisible();
  const panel = page.getByTestId("shape-panel");
  await expect(panel).toHaveCount(0);
  await page.getByTestId("canvas-dock").getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Rectangle" }).click();
  const box = (await canvas.boundingBox())!;
  await page.mouse.move(box.x + 400, box.y + 300);
  await page.mouse.down();
  await page.mouse.move(box.x + 560, box.y + 400, { steps: 4 });
  await page.mouse.up();
  await expect(panel).toBeVisible();
  // The old Thin / Bold bar is gone.
  await expect(page.getByRole("button", { name: "Thin", exact: true })).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Bold", exact: true })).toHaveCount(0);
  // No tabs and no title: the header is just Close.
  await expect(panel.getByRole("tab")).toHaveCount(0);
  const header = panel.locator(":scope > :first-child");
  await expect(header.getByRole("button")).toHaveCount(1);
  await expect(header.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  expect((await header.innerText()).trim()).toBe("");
  await expect(panel).not.toContainText(/^Shape/);
  const element = () => page.evaluate(() => {
    const rectangle = window.__orionBoard!.api.getSceneElements().filter((item) => item.type === "rectangle").at(-1)!;
    const { backgroundColor, strokeColor, fillStyle, strokeStyle, strokeWidth, opacity } = rectangle;
    return { backgroundColor, strokeColor, fillStyle, strokeStyle, strokeWidth, opacity };
  });

  // Fill: a swatch from the Fill colour button.
  await panel.getByRole("button", { name: "Fill", exact: true }).click();
  await page.getByRole("button", { name: "#3b82f6", exact: true }).click();
  await expect.poll(element).toMatchObject({ backgroundColor: "#3b82f6", fillStyle: "solid" });
  // The trigger's swatch shows the chosen colour.
  await expect(panel.locator('.orion-i-swatch[data-swatch="#3b82f6"]')).toHaveCount(1);
  // Picking a swatch closes the popup.
  await expect(page.getByRole("textbox", { name: "Hex", exact: true })).toHaveCount(0);

  // Stroke: a swatch from the Stroke colour button.
  await panel.getByRole("button", { name: "Stroke", exact: true }).click();
  await page.getByRole("button", { name: "#ef4444", exact: true }).click();
  await expect.poll(element).toMatchObject({ strokeColor: "#ef4444" });
  await expect(page.getByRole("textbox", { name: "Hex", exact: true })).toHaveCount(0);

  // Style, Thickness and Opacity.
  await panel.getByRole("combobox", { name: "Style", exact: true }).click();
  await page.getByRole("listbox", { name: "Style", exact: true }).getByRole("option", { name: "Dashed", exact: true }).click();
  const thickness = panel.getByRole("textbox", { name: "Thickness", exact: true });
  await thickness.fill("4");
  await thickness.press("Enter");
  const opacity = panel.getByRole("textbox", { name: "Opacity", exact: true });
  await opacity.fill("50");
  await opacity.press("Enter");
  await expect.poll(element).toMatchObject({ backgroundColor: "#3b82f6", strokeColor: "#ef4444", fillStyle: "solid", strokeStyle: "dashed", strokeWidth: 4, opacity: 50 });

  // Close clears the selection.
  await panel.getByRole("button", { name: "Close", exact: true }).click();
  await expect(panel).toHaveCount(0);
  expect(await page.evaluate(() => Object.keys(window.__orionBoard!.api.getAppState().selectedElementIds).length)).toBe(0);
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

test("the Shapes menu offers line and diamond as tools", async ({ page }) => {
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
});

type LineInfo = { count: number; width: number; height: number; spanX: number; spanY: number; first: [number, number] | null; selected: boolean; tool: string };
const lineInfo = (page: Page): Promise<LineInfo> => page.evaluate(() => {
  const api = window.__orionBoard!.api;
  const lines = api.getSceneElements().filter((element) => element.type === "line");
  const line = lines[lines.length - 1];
  const tool = api.getAppState().activeTool.type;
  if (!line || line.type !== "line") return { count: 0, width: 0, height: 0, spanX: 0, spanY: 0, first: null, selected: false, tool };
  const xs = line.points.map((point) => point[0]);
  const ys = line.points.map((point) => point[1]);
  return {
    count: lines.length, width: line.width, height: line.height,
    spanX: Math.max(...xs) - Math.min(...xs), spanY: Math.max(...ys) - Math.min(...ys),
    first: [line.points[0]![0], line.points[0]![1]], selected: Boolean(api.getAppState().selectedElementIds[line.id]), tool,
  };
});

test("the Triangle tool draws by dragging, stays resizable, and undoes in one step", async ({ page }) => {
  const problems: string[] = [];
  page.on("console", (message) => { if (message.type() === "error") problems.push(message.text()); });
  page.on("pageerror", (error) => problems.push(String(error)));
  await page.goto(route);
  const canvas = page.locator("canvas.excalidraw__canvas").last();
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const dock = page.getByTestId("canvas-dock");
  await dock.getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Triangle" }).click();
  expect(await page.evaluate(() => window.__orionBoard!.api.getAppState().activeTool.customType)).toBe("triangle");
  await expect(dock.getByRole("button", { name: "Shapes" })).toHaveAttribute("aria-pressed", "true");

  // Drag out a triangle, from the top-left down and right.
  const from = { x: box.x + 400, y: box.y + 300 };
  await page.mouse.move(from.x, from.y);
  await page.mouse.down();
  await page.mouse.move(from.x + 120, from.y + 90, { steps: 6 });
  await page.mouse.move(from.x + 200, from.y + 160, { steps: 6 });
  await page.mouse.up();
  const drawn = await lineInfo(page);
  expect(drawn.count).toBe(1);
  // Normalized, sized to the drag (zoom is 1 here), selected, and back on Select.
  expect(drawn.first).toEqual([0, 0]);
  expect(Math.round(drawn.width)).toBe(200);
  expect(Math.round(drawn.height)).toBe(160);
  expect({ width: drawn.width, height: drawn.height }).toEqual({ width: drawn.spanX, height: drawn.spanY });
  expect(drawn.selected).toBe(true);
  expect(drawn.tool).toBe("selection");
  await expect(dock.getByRole("button", { name: "Select" })).toHaveAttribute("aria-pressed", "true");

  // Resize from the bottom-right corner handle: it grows.
  const corner = await page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const view = api.getAppState();
    const line = api.getSceneElements().find((element) => element.type === "line")!;
    return { x: (line.x + line.width + view.scrollX) * view.zoom.value, y: (line.y + view.scrollY) * view.zoom.value };
  });
  // The handle sits just outside the corner of the shape's box.
  await page.mouse.move(box.x + corner.x + 11, box.y + corner.y + 12, { steps: 4 });
  await page.waitForTimeout(200); // hover first, as a person would
  await page.mouse.down();
  await page.mouse.move(box.x + corner.x + 71, box.y + corner.y + 72, { steps: 8 });
  await page.mouse.up();
  const resized = await lineInfo(page);
  expect(resized.width).toBeGreaterThan(drawn.width + 20);
  expect(resized.height).toBeGreaterThan(drawn.height + 20);

  // Undo steps back through what you did: first the resize, then the whole triangle.
  await page.keyboard.press("ControlOrMeta+z");
  const afterFirstUndo = await lineInfo(page);
  expect({ count: afterFirstUndo.count, width: Math.round(afterFirstUndo.width) }).toEqual({ count: 1, width: 200 });
  await page.keyboard.press("ControlOrMeta+z");
  expect((await lineInfo(page)).count).toBe(0);
  // And redo brings it back, still normalized.
  await page.keyboard.press("ControlOrMeta+Shift+z");
  const redone = await lineInfo(page);
  expect(redone.count).toBe(1);
  expect(redone.first).toEqual([0, 0]);
  expect(problems.filter((text) => text.includes("not normalized"))).toEqual([]);
});

test("a plain click with the Triangle tool drops in a default-size triangle", async ({ page }) => {
  await page.goto(route);
  const canvas = page.locator("canvas.excalidraw__canvas").last();
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  await page.getByTestId("canvas-dock").getByRole("button", { name: "Shapes" }).click();
  await page.getByRole("button", { name: "Triangle" }).click();
  await page.mouse.click(box.x + 500, box.y + 350);
  const placed = await lineInfo(page);
  expect(placed.count).toBe(1);
  expect(Math.round(placed.width)).toBe(120);
  expect(Math.round(placed.height)).toBe(120);
  expect(placed.selected).toBe(true);
});

test("Y picks the Triangle tool, but not while typing in a field", async ({ page }) => {
  await page.goto(route);
  const canvas = page.locator("canvas.excalidraw__canvas").last();
  await expect(canvas).toBeVisible();
  const box = (await canvas.boundingBox())!;
  const customTool = () => page.evaluate(() => window.__orionBoard!.api.getAppState().activeTool.customType);
  await page.mouse.click(box.x + 40, box.y + 40); // give the board focus, as a person would
  await page.keyboard.press("y");
  expect(await customTool()).toBe("triangle");
  await expect(page.getByTestId("canvas-dock").getByRole("button", { name: "Shapes" })).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("v");
  expect(await customTool()).toBeNull();
  // In a text field the key is just a letter.
  await page.getByLabel("Describe this screen").fill("");
  await page.getByLabel("Describe this screen").press("y");
  expect(await customTool()).toBeNull();
});

test("a conflicting save offers a Reload board button that clears it", async ({ browser, baseURL }) => {
  const room = "40000000-0000-4000-8000-000000000001";
  const open = async () => {
    const context = await browser.newContext();
    await context.addCookies([
      { name: "meld-e2e-user-id", value: "10000000-0000-4000-8000-000000000001", url: baseURL! },
      { name: "meld-e2e-user-email", value: "owner@example.com", url: baseURL! },
      { name: "meld-e2e-user-name", value: "Owner Example", url: baseURL! },
    ]);
    const page = await context.newPage();
    let lastPost = Date.now();
    page.on("response", (response) => { if (response.request().method() === "POST") lastPost = Date.now(); });
    await page.goto(`${route}?room=${room}`);
    await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
    // Opening a room board can save by itself (it fills in the room's built screens). Wait for that
    // to finish, so the next window starts from the latest version and only the drawing conflicts.
    await expect.poll(() => Date.now() - lastPost, { timeout: 15_000 }).toBeGreaterThan(1500);
    return page;
  };
  const drawRectangle = async (page: Page, offset: number) => {
    const box = (await page.locator("canvas.excalidraw__canvas").last().boundingBox())!;
    await page.getByTestId("canvas-dock").getByRole("button", { name: "Shapes" }).click();
    await page.getByRole("button", { name: "Rectangle" }).click();
    await page.mouse.move(box.x + box.width - 360 + offset, box.y + 250);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width - 240 + offset, box.y + 330, { steps: 4 });
    await page.mouse.up();
  };
  const first = await open();
  const second = await open();
  const saved = second.waitForResponse(async response => response.request().method() === "POST"
    && (await response.text()).includes('"status":"saved"'));
  await drawRectangle(second, 0);
  await expect.poll(()=>second.evaluate(()=>window.__orionBoard!.api.getSceneElements().filter(e=>e.type==="rectangle").length)).toBeGreaterThan(0);
  await saved;
  await expect(second.getByText("Could not save")).toHaveCount(0);
  await expect.poll(() => second.evaluate(() => window.__orionBoard!.api.getSceneElements().length)).toBeGreaterThan(0);
  // The server has acknowledged the other window; the first now has a stale base.
  await drawRectangle(first, 200);
  const notice = first.getByRole("alert").filter({ hasText: "changed in another window" });
  await expect(notice).toBeVisible();
  await expect(notice).toContainText("not saved");
  await first.getByRole("button", { name: "Reload board" }).click();
  await expect(first.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await expect(first.getByRole("alert").filter({ hasText: "changed in another window" })).toHaveCount(0);
  await first.context().close();
  await second.context().close();
});
