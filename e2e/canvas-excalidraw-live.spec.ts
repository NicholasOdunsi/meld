import { expect, test, type Page } from "@playwright/test";
import { readFile } from "node:fs/promises";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });
test.afterEach(async ({ page }, testInfo) => {
  if (testInfo.status !== testInfo.expectedStatus)
    await page
      .screenshot({
        path: `.context/plan3-h9-${testInfo.title.replace(/[^a-z0-9]+/gi, "-").slice(0, 100)}.png`,
        fullPage: true,
      })
      .catch(() => {});
});

const route = "/dev/canvas-excalidraw";

async function addFixture(page: Page, key: "sample" | "loop") {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.evaluate(
    (fixture) => window.__orionBoard!.addFixture(fixture),
    key,
  );
}

async function doubleClickScreen(page: Page, screenId: string) {
  const thumbnail = page.locator(`iframe[data-orion-frame="${screenId}"]`);
  await expect(thumbnail).toBeVisible();
  const box = (await thumbnail.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
}

test("double-click wakes a screen with its scripts, and Escape puts it back to sleep", async ({
  page,
}) => {
  await addFixture(page, "sample");
  await doubleClickScreen(page, "welcome");
  const live = page.locator('iframe[data-orion-live="welcome"]');
  const livePage = page.frameLocator('iframe[data-orion-live="welcome"]');
  await expect(live).toBeVisible();
  await expect(livePage.getByText("script ran")).toBeVisible();
  expect(
    await live.evaluate((frame) => getComputedStyle(frame).outlineStyle),
  ).toBe("solid");
  await livePage.getByRole("button", { name: "Log in" }).click();
  await page.keyboard.press("Escape");
  await expect(live).toHaveCount(0);
  // A board-only screen keeps its own HTML: no snapshot replaces it.
  expect(
    await page
      .locator('iframe[data-orion-frame="welcome"]')
      .getAttribute("srcdoc"),
  ).toContain("script has not run");
});

// The pill's buttons, in order, by accessible name.
const pillButtonNames = (pill: ReturnType<Page["locator"]>) =>
  pill.getByRole("button").evaluateAll((buttons) => buttons.map((button) => button.getAttribute("aria-label")));

async function selectScreen(page: Page) {
  await page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const frame = api
      .getSceneElements()
      .find((element) => element.type === "embeddable")!;
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
  });
}

test("the pill's Edit wakes the selected screen; a screen that can't be edited opens its Code", async ({ page }) => {
  await addFixture(page, "sample");
  await selectScreen(page);
  const pill = page.getByTestId("selection-pill");
  // A selected sleeping screen shows the main pill: no separate Open live.
  await expect.poll(() => pillButtonNames(pill)).toEqual(["Edit", "Undo", "Redo", "Code"]);
  await expect(pill.getByRole("button", { name: "Open live" })).toHaveCount(0);
  await pill.getByRole("button", { name: "Edit", exact: true }).click();
  await expect(page.locator('iframe[data-orion-live="welcome"]')).toBeVisible();
  await expect.poll(() => pillButtonNames(pill)).toEqual(["Code"]);
  // A lab screen has no room to save to, so it can't be edited: waking opens its Code (there is
  // nothing to select), with Tweak disabled, and its pill keeps only Code.
  const panel = page.getByTestId("live-panel");
  await expect(panel.getByRole("tab", { name: "Code", exact: true })).toHaveAttribute("aria-selected", "true");
  await expect(panel.getByRole("tab", { name: "Tweak", exact: true })).toHaveAttribute("aria-disabled", "true");
  await expect(panel).toContainText("index.html");
  await pill.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.getByTestId("live-panel")).toContainText("index.html");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("live-panel")).toHaveCount(0);
});

test("an endless loop shows the stopped overlay and the board keeps working", async ({
  page,
}) => {
  await addFixture(page, "loop");
  await doubleClickScreen(page, "loop");
  await expect(page.getByText("This screen stopped responding")).toBeVisible();
  await expect(page.locator("iframe[data-orion-live]")).toHaveCount(0);
  const zoom = () =>
    page.evaluate(() => window.__orionBoard!.api.getAppState().zoom.value);
  const before = await zoom();
  await page.getByRole("button", { name: "Zoom in" }).click();
  expect(await zoom()).toBeGreaterThan(before);
  await page.getByRole("button", { name: "Show code" }).click();
  await expect(page.getByTestId("live-panel")).toContainText("while(true)");
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.getByText("This screen stopped responding")).toBeVisible();
  // Clicking empty board puts it to sleep and closes the panel.
  const canvas = page.locator("canvas.excalidraw__canvas").last();
  const box = (await canvas.boundingBox())!;
  await page.mouse.click(box.x + 40, box.y + box.height - 40);
  await expect(page.getByText("This screen stopped responding")).toHaveCount(0);
  await expect(page.getByTestId("live-panel")).toHaveCount(0);
});

test("duplicate frames for one screen wake only the clicked copy", async ({
  page,
}) => {
  await addFixture(page, "sample");
  await page.evaluate(() => window.__orionBoard!.addFixture("sample"));
  const thumbnails = page.locator('iframe[data-orion-frame="welcome"]');
  await expect(thumbnails).toHaveCount(2);
  const target = (await thumbnails.last().boundingBox())!;
  await page.mouse.dblclick(
    target.x + target.width / 2,
    target.y + target.height / 2,
  );
  const live = page.locator('iframe[data-orion-live="welcome"]');
  await expect(live).toHaveCount(1);
  await expect(thumbnails).toHaveCount(1);
  expect((await live.boundingBox())!.x).toBeCloseTo(target.x);

  const other = (await thumbnails.boundingBox())!;
  await page.mouse.dblclick(
    other.x + other.width / 2,
    other.y + other.height / 2,
  );
  await expect(live).toHaveCount(1);
  await expect
    .poll(async () => (await live.boundingBox())?.x)
    .toBeCloseTo(other.x);
  await expect(thumbnails).toHaveCount(1);
});

test("a compile failure opens Code and keeps the static picture", async ({
  page,
}) => {
  await addFixture(page, "sample");
  await page.evaluate(() =>
    window.__orionBoard!.setScreen(
      "welcome",
      "<h1>Picture</h1><script>const = 1;</script>",
    ),
  );
  await doubleClickScreen(page, "welcome");
  await expect(page.getByTestId("live-panel")).toContainText(
    "Unexpected token",
  );
  await expect(
    page.locator('iframe[data-orion-frame="welcome"]'),
  ).toBeVisible();
  await expect(page.locator("iframe[data-orion-live]")).toHaveCount(0);
});

test("a delayed Code action cannot reopen the panel after reopening the same frame", async ({
  page,
  baseURL,
}) => {
  let releaseRuntime!: () => void;
  const runtimeBlocked = new Promise<void>((resolve) => {
    releaseRuntime = resolve;
  });
  await page.route("**/screen-runtime/runtime.js", async (route) => {
    await runtimeBlocked;
    await route.continue();
  });
  try {
    // A room screen, so it is editable and waking it opens no panel by itself.
    await openRoomBoard(page, baseURL!);
    await page.evaluate(() => window.__orionBoard!.addFixture("sample"));
    const selectScreen = () => page.evaluate(() => {
      const api = window.__orionBoard!.api;
      const frame = api.getSceneElements().filter((element) => element.type === "embeddable").at(-1)!;
      api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
    });
    await selectScreen();
    const pill = page.getByTestId("selection-pill");
    const runtimeRequested = page.waitForRequest(
      "**/screen-runtime/runtime.js",
    );
    await pill.getByRole("button", { name: "Code", exact: true }).click();
    await runtimeRequested;
    await page.keyboard.press("Escape");
    await selectScreen();
    await pill.getByRole("button", { name: "Edit", exact: true }).click();
    releaseRuntime();

    await expect(
      page
        .frameLocator('iframe[data-orion-live="welcome"]')
        .getByText("script ran"),
    ).toBeVisible();
    // Waking from Edit opens no panel (Edit is on), and the abandoned Code action must not open one later.
    await expect(pill.getByRole("button", { name: "Edit", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(page.getByTestId("live-panel")).toHaveCount(0);
    await page.waitForTimeout(500);
    await expect(page.getByTestId("live-panel")).toHaveCount(0);
  } finally {
    releaseRuntime();
  }
});

const roomId = "40000000-0000-4000-8000-000000000001";

async function openRoomBoard(page: Page, baseURL: string) {
  await page.context().addCookies([
    {
      name: "meld-e2e-user-id",
      value: "10000000-0000-4000-8000-000000000001",
      url: baseURL,
    },
    { name: "meld-e2e-user-email", value: "owner@example.com", url: baseURL },
    { name: "meld-e2e-user-name", value: "Owner Example", url: baseURL },
  ]);
  await page.goto(`${route}?room=${roomId}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
}

async function pasteCode(
  page: Page,
  code: string,
  device: "Phone" | "Tablet" | "Desktop",
) {
  await page
    .getByTestId("canvas-dock")
    .getByRole("button", { name: "Code" })
    .click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: device }).click();
  await dialog.getByLabel("Code").fill(code);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  return dialog;
}

// The pill under the awake screen shows whether or not its frame is selected on the board.
const pill = (page: Page) => page.getByTestId("selection-pill");
const pillButton = (page: Page, name: "Edit" | "Undo" | "Redo" | "Code") =>
  pill(page).getByRole("button", { name, exact: true });

// Screens are interactive after waking; the pill's Edit turns element picking on (or off).
async function toggleEdit(page: Page, on: boolean) {
  const edit = pillButton(page, "Edit");
  await expect(edit).toHaveAttribute("aria-pressed", on ? "false" : "true");
  await edit.click();
  await expect(edit).toHaveAttribute("aria-pressed", on ? "true" : "false");
}

// Opens the Code tab through the pill: waking a screen does not open the panel.
async function openCode(page: Page) {
  await pillButton(page, "Code").click();
}

const tab = (panel: ReturnType<Page["locator"]>, name: "Tweak" | "Code") =>
  panel.getByRole("tab", { name, exact: true });

test("pasted React goes live, works, sleeps to a script-free picture and wakes again", async ({
  page,
  baseURL,
}) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(
    page,
    `import { useState } from "react";
import { Plus } from "lucide-react";
export default function App() {
  const [count, setCount] = useState(0);
  return (
    <main className="p-6">
      <button className="rounded-lg bg-blue-600 px-4 py-2 text-white" onClick={() => setCount(count + 1)}>
        <Plus size={16} /> Count {count}
      </button>
    </main>
  );
}`,
    "Phone",
  );
  const liveFrame = page.locator("iframe[data-orion-live]");
  await expect(liveFrame).toBeVisible();
  const screenId = (await liveFrame.getAttribute("data-orion-live"))!;
  expect(screenId).toMatch(/^ds-/);
  const app = page.frameLocator("iframe[data-orion-live]");
  // Waking selects nothing and opens no panel; the screen takes clicks straight away.
  await expect(page.getByTestId("live-panel")).toHaveCount(0);
  await app.getByRole("button", { name: /Count 0/ }).click();
  await expect(app.getByRole("button", { name: /Count 1/ })).toBeVisible();
  // Tailwind ran inside the frame.
  expect(
    await app
      .getByRole("button")
      .evaluate((button) => getComputedStyle(button).borderTopLeftRadius),
  ).not.toBe("0px");
  // Focus is inside the frame: the bridge forwards Escape. Not in Edit and nothing selected, so it sleeps.
  await page.keyboard.press("Escape");
  await expect(liveFrame).toHaveCount(0);
  const thumbnail = page.locator(`iframe[data-orion-frame="${screenId}"]`);
  await expect
    .poll(() => thumbnail.getAttribute("srcdoc"))
    .toContain("Count 1");
  const srcdoc = (await thumbnail.getAttribute("srcdoc"))!;
  expect(srcdoc).not.toContain("<script");
  expect(srcdoc).not.toContain("data-orion-src");
  await doubleClickScreen(page, screenId);
  await expect(
    page
      .frameLocator("iframe[data-orion-live]")
      .getByRole("button", { name: /Count 0/ }),
  ).toBeVisible();
});

test("a pasted endless loop shows the stopped overlay and Reload brings it back", async ({
  page,
  baseURL,
}) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(
    page,
    "export default function App() {\n  return <button onClick={() => { while (true) {} }}>Freeze</button>;\n}",
    "Phone",
  );
  await page
    .frameLocator("iframe[data-orion-live]")
    .getByRole("button", { name: "Freeze" })
    .click();
  await expect(page.getByText("This screen stopped responding")).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(
    page
      .frameLocator("iframe[data-orion-live]")
      .getByRole("button", { name: "Freeze" }),
  ).toBeVisible();
});

test("pasted HTML runs its inline handlers", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(
    page,
    `<main><button onclick="this.textContent = 'Clicked'">Press</button></main>`,
    "Desktop",
  );
  const app = page.frameLocator("iframe[data-orion-live]");
  await app.getByRole("button", { name: "Press" }).click();
  await expect(app.getByRole("button", { name: "Clicked" })).toBeVisible();
});

const tallPage = `<main>${Array.from({ length: 30 }, (_, index) => `<section style="height:200px"><h2>Section ${index}</h2></section>`).join("")}</main>`;

test("a wheel over an awake screen scrolls the screen, never the board, even at the end of the page", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, tallPage, "Desktop");
  const live = page.locator("iframe[data-orion-live]");
  await expect(page.frameLocator("iframe[data-orion-live]").getByText("Section 29")).toBeAttached();
  const content = (await (await live.elementHandle())!.contentFrame())!;
  const boardScroll = () => page.evaluate(() => {
    const state = window.__orionBoard!.api.getAppState();
    return { x: state.scrollX, y: state.scrollY, zoom: state.zoom.value };
  });
  const pageScroll = () => content.evaluate(() => window.scrollY);
  // The page keeps its scrolling to itself (the screen's own CSS can still override it).
  expect(await content.evaluate(() => [document.documentElement, document.body].map((element) => getComputedStyle(element).overscrollBehaviorY)))
    .toEqual(["contain", "contain"]);
  const box = (await live.boundingBox())!;
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  const start = await boardScroll();

  // Mid-page: the screen scrolls, the board stays put.
  await page.mouse.wheel(0, 300);
  await expect.poll(pageScroll).toBe(300);
  expect(await boardScroll()).toEqual(start);
  await page.screenshot({ path: ".context/fu-scrollfix-1-mid-page.png" });

  // At the end of the page the leftover scroll goes nowhere.
  await content.evaluate(() => window.scrollTo(0, document.documentElement.scrollHeight));
  const end = await pageScroll();
  await page.mouse.wheel(0, 300);
  await page.waitForTimeout(300);
  expect(await pageScroll()).toBe(end);
  expect(await boardScroll()).toEqual(start);

  // WebKit (the Mac app) hands a wheel the page did not use to the board's page as a wheel on the
  // iframe element, which Excalidraw pans the board for. Chromium never does, so send it the way WebKit would.
  const forwarded = await live.evaluate((frame) => {
    const rect = frame.getBoundingClientRect();
    const event = new WheelEvent("wheel", { deltaY: 300, bubbles: true, cancelable: true, clientX: rect.x + 40, clientY: rect.y + 40 });
    frame.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(forwarded).toBe(true);
  await page.waitForTimeout(300);
  expect(await boardScroll()).toEqual(start);
  await page.screenshot({ path: ".context/fu-scrollfix-2-end-of-page.png" });

  // With the pointer off the screen, the wheel still pans the board.
  await page.mouse.move(box.x + box.width / 2, box.y + box.height + 40);
  await page.mouse.wheel(0, 200);
  await expect.poll(async () => (await boardScroll()).y).toBeLessThan(start.y);
  await expect(live).toBeVisible();
});

test("an unsupported package is named in the dialog and nothing is created", async ({
  page,
  baseURL,
}) => {
  await openRoomBoard(page, baseURL!);
  const sourceWrites: string[] = [];
  page.on("request", request => {
    const body=request.postData();
    if(request.method()==="POST" && body?.includes("framer-motion"))sourceWrites.push(body);
  });
  const dialog = await pasteCode(
    page,
    'import { motion } from "framer-motion";\nexport default function App() { return <motion.div>Hi</motion.div>; }',
    "Phone",
  );
  await expect(
    dialog.getByText("Unsupported package: framer-motion"),
  ).toBeVisible();
  // Background backfill may recover earlier screens while the dialog is open.
  // The unsupported authored source must never be sent to a save/create action.
  expect(sourceWrites).toEqual([]);
  await expect(dialog).toBeVisible();
});

const editableCounter = `import { useState } from "react";
export default function App() {
  const [count, setCount] = useState(0);
  return <main><button className="bg-red-500 text-white p-4" onClick={() => setCount(count + 1)}>Start</button><output aria-label="Count">{count}</output></main>;
}`;

test("a single click on a sleeping screen shows the main pill; its Edit wakes the screen in Edit", async ({
  page,
  baseURL,
}) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, editableCounter, "Phone");
  const live = page.locator("iframe[data-orion-live]");
  await expect(live).toBeVisible();
  const id = (await live.getAttribute("data-orion-live"))!;
  // Put it to sleep (not in Edit, nothing selected), then select it with one click.
  await page.keyboard.press("Escape");
  await expect(live).toHaveCount(0);
  const thumbnail = page.locator(`iframe[data-orion-frame="${id}"]`);
  await expect(thumbnail).toBeVisible();
  const box = (await thumbnail.boundingBox())!;
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
  await expect.poll(() => pillButtonNames(pill(page))).toEqual(["Edit", "Undo", "Redo", "Code"]);
  await expect(pill(page).getByRole("button", { name: "Open live" })).toHaveCount(0);
  await expect(pillButton(page, "Edit")).toHaveAttribute("aria-pressed", "false");
  await expect(pillButton(page, "Undo")).toBeDisabled();
  await expect(pillButton(page, "Redo")).toBeDisabled();
  // Selecting keeps it a picture: nothing wakes until Edit.
  await expect(live).toHaveCount(0);
  await page.screenshot({ path: ".context/fu-pill-1-selected-sleeping.png" });
  await pillButton(page, "Edit").click();
  // Awake and interactive in Edit, with no panel and nothing selected yet.
  await expect(live).toBeVisible();
  await expect(pillButton(page, "Edit")).toHaveAttribute("aria-pressed", "true");
  const panel = page.getByTestId("live-panel");
  await expect(panel).toHaveCount(0);
  await page.screenshot({ path: ".context/fu-pill-2-after-edit.png" });
  // The next click on an element selects it (it does not run the screen) and opens the panel on Tweak.
  const app = page.frameLocator("iframe[data-orion-live]");
  await app.getByRole("button", { name: "Start", exact: true }).click();
  await expect(tab(panel, "Tweak")).toHaveAttribute("aria-selected", "true");
  await expect(app.getByLabel("Count")).toHaveText("0");
  await page.screenshot({ path: ".context/fu-pill-3-picked.png" });
  // Edit again turns it off, as on any awake screen: the selection clears and the panel closes.
  await toggleEdit(page, false);
  await expect(panel).toHaveCount(0);
  await expect(live).toBeVisible();
});

async function persisted(page: Page, boardId: string) {
  return page.evaluate(async (id) => {
    const probe = window.__orionBoard!.readCanvasEditTestState;
    if (!probe) throw new Error("E2E persistence probe unavailable");
    const result = await probe(id.replace(/^ds-/, ""));
    if (result.status !== "ok") throw new Error("Persisted screen unavailable");
    return result;
  }, boardId);
}

async function copyActiveFile(page: Page) {
  await page
    .getByTestId("live-panel")
    .getByRole("button", { name: "Copy", exact: true })
    .click();
  return page.evaluate(() => navigator.clipboard.readText());
}

test("picked colour persists once across sleep and reload with exact authored source", async ({
  page,
  baseURL,
}) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, editableCounter, "Phone");
  const live = page.locator("iframe[data-orion-live]");
  await expect(live).toBeVisible();
  const id = (await live.getAttribute("data-orion-live"))!;
  const before = await persisted(page, id);
  const panel = page.getByTestId("live-panel");
  // Nothing is selected yet, so there is no panel.
  await expect(panel).toHaveCount(0);
  // Warm the lazy editor before making the one persisted change.
  await openCode(page);
  await expect(
    panel.getByRole("textbox", { name: "Source for App.tsx" }),
  ).toBeVisible();
  expect(await copyActiveFile(page)).toBe(editableCounter);
  const app = page.frameLocator("iframe[data-orion-live]");
  // In Edit, clicking the element selects it (no Pick button) and shows the Tweak tab.
  await toggleEdit(page, true);
  await app.getByRole("button", { name: "Start", exact: true }).click();
  await expect(app.getByLabel("Count")).toHaveText("0");
  await expect(tab(panel, "Tweak")).toHaveAttribute("aria-selected", "true");
  const colour = panel.getByRole("button", {
    name: "Background colour",
    exact: true,
  });
  await expect(colour).toBeEnabled();
  await colour.click();
  // The colour popup is not inside the panel.
  const hex = page.getByRole("textbox", { name: "Hex", exact: true });
  await hex.fill("#123456");
  await hex.press("Enter");
  await expect(
    app.getByRole("button", { name: "Start", exact: true }),
  ).toHaveCSS("background-color", "rgb(18, 52, 86)");
  await tab(panel, "Code").click();
  const copied = await copyActiveFile(page);
  expect(copied).toContain("bg-[#123456]");
  expect(copied).not.toContain("data-orion-src");
  expect(copied).not.toContain("__ORION");
  // Escape clears the selection, then leaves Edit (the screen stays awake), then puts it to sleep.
  await page.keyboard.press("Escape");
  await expect(live).toHaveCount(1);
  await expect(pillButton(page, "Edit")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(pillButton(page, "Edit")).toHaveAttribute("aria-pressed", "false");
  await expect(live).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(live).toHaveCount(0);
  await expect
    .poll(async () => (await persisted(page, id)).versionCount)
    .toBe(before.versionCount + 1);
  const saved = await persisted(page, id);
  expect(saved.versionId).not.toBe(before.versionId);
  expect(saved.source.files["App.tsx"]).toBe(copied);
  await page.reload();
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  expect(await persisted(page, id)).toEqual(saved);
  await expect.poll(()=>page.evaluate(id=>window.__orionBoard!.focusScreen(id.replace(/^ds-/,"")),id)).toBe(true);
  await doubleClickScreen(page, id);
  await expect(
    page
      .frameLocator("iframe[data-orion-live]")
      .getByRole("button", { name: "Start" }),
  ).toHaveCSS("background-color", "rgb(18, 52, 86)");
  expect((await persisted(page, id)).versionCount).toBe(saved.versionCount);
});

test("invalid Code keeps the old iframe interactive then fixes, undoes and downloads authored bytes", async ({
  page,
  baseURL,
}) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, editableCounter, "Phone");
  const panel = page.getByTestId("live-panel");
  await expect(panel).toHaveCount(0);
  await openCode(page);
  const editor = panel.getByRole("textbox", { name: "Source for App.tsx" });
  await expect(editor).toBeVisible();
  await editor.fill(
    "export default function App( { return <button>Broken</button>; }",
  );
  await expect(panel).toContainText(/Unexpected/);
  const app = page.frameLocator("iframe[data-orion-live]");
  // The old frame is still awake and interactive (not in Edit): it takes the click.
  await expect(pillButton(page, "Edit")).toHaveAttribute("aria-pressed", "false");
  await app.getByRole("button", { name: "Start", exact: true }).click();
  await expect(app.getByLabel("Count")).toHaveText("1");
  const fixed = editableCounter.replace(
    ">Start</button>",
    ">Continue</button>",
  );
  await editor.fill(fixed);
  await expect(
    app.getByRole("button", { name: "Continue", exact: true }),
  ).toBeVisible();
  // Undo and Redo are the pill's.
  await pillButton(page, "Undo").click();
  await expect(editor).toContainText("Broken");
  await pillButton(page, "Redo").click();
  await expect(
    app.getByRole("button", { name: "Continue", exact: true }),
  ).toBeVisible();
  const authored = await copyActiveFile(page);
  expect(authored).toBe(fixed);
  const downloadPromise = page.waitForEvent("download");
  await panel.getByRole("button", { name: "Download", exact: true }).click();
  const download = await downloadPromise;
  expect(download.suggestedFilename()).toBe("App.tsx");
  const path = await download.path();
  expect(path).not.toBeNull();
  expect(await readFile(path!, "utf8")).toBe(authored);
});

test("two editors preserve the conflicting draft until Reload latest",async({page,context,baseURL})=>{
 await openRoomBoard(page,baseURL!);
 await pasteCode(page,"<button>Before</button>","Phone");
 const live=page.locator('iframe[data-orion-live]');await expect(live).toBeVisible();
 const id=(await live.getAttribute('data-orion-live'))!;
 const frame=await page.evaluate(id=>window.__orionBoard!.api.getSceneElements().find(e=>e.type==='embeddable' && e.link?.endsWith(id)),id);
 expect(frame).toBeTruthy();
 const other=await context.newPage();
 try{
  await openRoomBoard(other,baseURL!);
  await other.evaluate(({frame,id})=>{
   const board=window.__orionBoard!;board.setScreen(id,'<button>Picture</button>');
   board.api.updateScene({elements:[frame!]});
  },{frame,id});
  await doubleClickScreen(other,id);
  const panel=page.getByTestId('live-panel'),otherPanel=other.getByTestId('live-panel');
  await openCode(page);
  await openCode(other);
  const first=panel.getByRole('textbox',{name:'Source for index.html'}),second=otherPanel.getByRole('textbox',{name:'Source for index.html'});
  await expect(first).toBeVisible();await expect(second).toBeVisible();
  const before=await persisted(page,id);
  await first.fill('<button>First</button>');
  await page.keyboard.press('Escape');
  await expect.poll(async()=> (await persisted(page,id)).versionCount).toBe(before.versionCount+1);
  await second.fill('<button>Second</button>');
  await expect(otherPanel.getByRole('button',{name:'Reload latest'})).toBeVisible();
  await expect(second).toContainText('Second');
  await otherPanel.getByRole('button',{name:'Reload latest'}).click();
  await expect(second).toContainText('First');
  await expect(other.frameLocator('iframe[data-orion-live]').getByRole('button',{name:'First',exact:true})).toBeVisible();
  expect((await persisted(other,id)).versionCount).toBe(before.versionCount+1);
 }finally{await other.close();}
});

test("a board-only screen converts on its first edit without duplicating or moving its frame",async({page,baseURL})=>{
 await openRoomBoard(page,baseURL!);await page.evaluate(()=>window.__orionBoard!.addFixture('sample'));
 const before=await page.evaluate(()=>{
  const elements=window.__orionBoard!.api.getSceneElements();
  const frame=elements.filter(e=>e.type==='embeddable').at(-1)!;
  return {frame,count:elements.filter(e=>e.type==='embeddable').length};
 });
 const thumbnail=page.locator('iframe[data-orion-frame="welcome"]').last();const box=(await thumbnail.boundingBox())!;
 await page.mouse.dblclick(box.x+box.width/2,box.y+box.height/2);
 const panel=page.getByTestId('live-panel');await expect(panel).toHaveCount(0);await openCode(page);
 const editor=panel.getByRole('textbox',{name:'Source for index.html'});await expect(editor).toBeEditable();
 await editor.fill('<main><button>Converted</button></main>');
 await expect.poll(()=>page.locator('iframe[data-orion-live]').getAttribute('data-orion-live')).toMatch(/^ds-/);
 const id=(await page.locator('iframe[data-orion-live]').getAttribute('data-orion-live'))!;
 const after=await page.evaluate(frameId=>{
  const elements=window.__orionBoard!.api.getSceneElements();return {frame:elements.find(e=>e.id===frameId)!,count:elements.filter(e=>e.type==='embeddable').length};
 },before.frame.id);
 expect(after.count).toBe(before.count);
 for(const key of ['id','x','y','width','height','angle','groupIds'] as const)expect(after.frame[key]).toEqual(before.frame[key]);
 const saved=await persisted(page,id);expect(saved.versionCount).toBe(1);expect(saved.source.files['index.html']).toBe('<main><button>Converted</button></main>');
 await expect(page.frameLocator('iframe[data-orion-live]').getByRole('button',{name:'Converted',exact:true})).toBeVisible();
 // In Edit, clicking the element selects it (there is no Pick button) and shows the Tweak panel.
 await toggleEdit(page,true);
 await page.frameLocator('iframe[data-orion-live]').getByRole('button',{name:'Converted',exact:true}).click();
 await expect(panel.getByRole('textbox',{name:'Text',exact:true})).toBeEnabled();
 await page.screenshot({path:'.context/plan3-hand-editing.png',fullPage:true});
});

// ---- Inspector acceptance: Edit picks, real values, colour popup, pill history, Code, Escape order ----

const redButton = `export default function App(){return <button className="bg-red-500 p-3 text-white">Start</button>}`;

// Opens a board, pastes the red button screen and returns handles on its pieces.
async function openRedButton(page: Page, baseURL: string) {
  await openRoomBoard(page, baseURL);
  await pasteCode(page, redButton, "Phone");
  const live = page.locator("iframe[data-orion-live]");
  await expect(live).toBeVisible();
  const app = page.frameLocator("iframe[data-orion-live]");
  const button = app.getByRole("button", { name: "Start", exact: true });
  await expect(button).toBeVisible();
  return { live, app, button, panel: page.getByTestId("live-panel") };
}

// Turns Edit on and selects the red button: the panel opens on Tweak.
async function selectRedButton(page: Page, button: ReturnType<Page["locator"]>, panel: ReturnType<Page["locator"]>) {
  await toggleEdit(page, true);
  await button.click();
  await expect(panel).toBeVisible();
  await expect(tab(panel, "Tweak")).toHaveAttribute("aria-selected", "true");
}

// An edit recompiles the screen and swaps its frame, so a read can land on the old one while it is
// torn down: report "" and let expect.poll retry. Any other failure is a real one and is thrown.
const computed = (button: ReturnType<Page["locator"]>, property: string) =>
  button.evaluate((element, name) => getComputedStyle(element).getPropertyValue(name), property).catch((error: Error) => {
    if (/Frame was detached|Execution context was destroyed|Target (page, context or browser|closed)/.test(error.message)) return "";
    throw error;
  });

// The in-frame selection outline sits on the element: same box, within a couple of pixels.
async function expectOutlineOn(app: ReturnType<Page["frameLocator"]>, element: ReturnType<Page["locator"]>) {
  const overlay = app.locator("[data-orion-overlay]");
  await expect(overlay).toHaveCount(1);
  await expect
    .poll(async () => {
      const [outline, target] = await Promise.all([overlay.boundingBox().catch(() => null), element.boundingBox().catch(() => null)]);
      if (!outline || !target) return null;
      return [outline.x - target.x, outline.y - target.y, outline.width - target.width, outline.height - target.height].map((delta) => Math.abs(delta) <= 2);
    })
    .toEqual([true, true, true, true]);
}

// Picks an option of an inspector dropdown (a combobox button opening a listbox).
async function choose(scope: ReturnType<Page["locator"]>, page: Page, field: string, option: string) {
  await scope.getByRole("combobox", { name: field, exact: true }).click();
  await page.getByRole("listbox", { name: field, exact: true }).getByRole("option", { name: option, exact: true }).click();
}

const hexToRgb = (hex: string) => {
  const n = Number.parseInt(hex.slice(1), 16);
  return `rgb(${(n >> 16) & 255}, ${(n >> 8) & 255}, ${n & 255})`;
};

test("double-click wakes a screen that takes clicks straight away, with no extra step and no panel", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, editableCounter, "Phone");
  const live = page.locator("iframe[data-orion-live]");
  await expect(live).toBeVisible();
  const id = (await live.getAttribute("data-orion-live"))!;
  // Put it to sleep, then wake it the way a person does.
  await page.keyboard.press("Escape");
  await expect(live).toHaveCount(0);
  await doubleClickScreen(page, id);
  const app = page.frameLocator("iframe[data-orion-live]");
  const start = app.getByRole("button", { name: "Start", exact: true });
  await expect(start).toBeVisible();
  await expect(pillButton(page, "Edit")).toHaveAttribute("aria-pressed", "false");
  await start.click();
  await expect(app.getByLabel("Count")).toHaveText("1");
  await expect(page.getByTestId("live-panel")).toHaveCount(0);
  await expect(app.locator("[data-orion-overlay]")).toHaveCount(0);
});

test("the pill's Edit: on, a click selects and opens Tweak; off, the panel closes and clicks work again", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, editableCounter, "Phone");
  const app = page.frameLocator("iframe[data-orion-live]");
  const start = app.getByRole("button", { name: "Start", exact: true });
  const panel = page.getByTestId("live-panel");
  await expect(start).toBeVisible();
  // The pill is there without selecting the frame on the board.
  await expect.poll(() => page.evaluate(() => Object.keys(window.__orionBoard!.api.getAppState().selectedElementIds).length)).toBe(0);
  await expect(pill(page)).toBeVisible();
  await toggleEdit(page, true);
  await start.click();
  await expect(panel).toBeVisible();
  await expect(tab(panel, "Tweak")).toHaveAttribute("aria-selected", "true");
  await expectOutlineOn(app, start);
  // Selecting did not count.
  await expect(app.getByLabel("Count")).toHaveText("0");
  await toggleEdit(page, false);
  await expect(panel).toHaveCount(0);
  await expect(app.locator("[data-orion-overlay]")).toHaveCount(0);
  await start.click();
  await expect(app.getByLabel("Count")).toHaveText("1");
  await start.click();
  await expect(app.getByLabel("Count")).toHaveText("2");
  await expect(panel).toHaveCount(0);
});

test("clicking an element in Edit selects it with real values: Escape clears the selection, leaves Edit, then sleeps the screen", async ({ page, baseURL }) => {
  const { live, button, panel } = await openRedButton(page, baseURL!);
  await expect(panel).toHaveCount(0);
  await selectRedButton(page, button, panel);
  // p-3 is 12px, read from the real source.
  await expect(panel.getByRole("textbox", { name: "Padding", exact: true })).toHaveValue("12");
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(live).toHaveCount(1);
  await expect(pillButton(page, "Edit")).toHaveAttribute("aria-pressed", "true");
  await page.keyboard.press("Escape");
  await expect(pillButton(page, "Edit")).toHaveAttribute("aria-pressed", "false");
  await expect(live).toHaveCount(1);
  await page.keyboard.press("Escape");
  await expect(live).toHaveCount(0);
});

test("the panel shows real sizes and its Font and Weight dropdowns change the screen, keeping the selection", async ({ page, baseURL }) => {
  const { app, button, panel } = await openRedButton(page, baseURL!);
  await selectRedButton(page, button, panel);
  const width = panel.getByRole("textbox", { name: "Width", exact: true });
  const height = panel.getByRole("textbox", { name: "Height", exact: true });
  await expect(width).toHaveValue(/^\d+(\.\d+)?$/);
  await expect(height).toHaveValue(/^\d+(\.\d+)?$/);
  // They are the rendered size, not a placeholder.
  const box = (await button.boundingBox())!;
  expect(Number(await width.inputValue())).toBeCloseTo(box.width, -1);
  expect(Number(await height.inputValue())).toBeCloseTo(box.height, -1);

  await choose(panel, page, "Weight", "Bold");
  await expect.poll(() => computed(button, "font-weight")).toBe("700");
  await choose(panel, page, "Font", "Mono");
  await expect.poll(() => computed(button, "font-family")).toContain("monospace");
  // Still selected after both edits: the in-frame outline and the panel remain.
  await expectOutlineOn(app, button);
  await expect(panel.getByRole("textbox", { name: "Padding", exact: true })).toHaveValue("12");
});

test("the colour popup applies a swatch, rejects a bad hex in plain words, and Escape closes only the popup", async ({ page, baseURL }) => {
  const { live, button, panel } = await openRedButton(page, baseURL!);
  await selectRedButton(page, button, panel);
  const before = await computed(button, "background-color");
  expect(before).not.toBe("");
  await panel.getByRole("button", { name: "Background colour", exact: true }).click();
  const hex = page.getByRole("textbox", { name: "Hex", exact: true });
  await expect(hex).toBeVisible();

  // A bad hex says so and changes nothing.
  await hex.fill("#12345");
  await hex.press("Enter");
  await expect(page.getByText("Use a colour like #1A2B3C.")).toBeVisible();
  expect(await computed(button, "background-color")).toBe(before);

  // Escape inside the popup closes the popup only.
  await hex.press("Escape");
  await expect(hex).toHaveCount(0);
  await expect(live).toHaveCount(1);
  await expect(panel).toBeVisible();

  // A swatch applies its colour. The popup reopens on the first click straight after Escape.
  const swatch = page.getByRole("button", { name: "#3b82f6", exact: true });
  await panel.getByRole("button", { name: "Background colour", exact: true }).click();
  await expect(swatch).toBeVisible();
  await swatch.click();
  await expect.poll(() => computed(button, "background-color")).toBe(hexToRgb("#3b82f6"));
  expect(hexToRgb("#3b82f6")).not.toBe(before);
});

test("Undo and Redo are on the pill, move the colour back and forth, and keep the element selected", async ({ page, baseURL }) => {
  const { app, button, panel } = await openRedButton(page, baseURL!);
  const original = await computed(button, "background-color");
  expect(original).not.toBe("");
  const undo = pillButton(page, "Undo");
  const redo = pillButton(page, "Redo");
  await expect(undo).toBeDisabled();
  await expect(redo).toBeDisabled();
  await selectRedButton(page, button, panel);
  // The panel has none of its own.
  await expect(panel.getByRole("button", { name: /^(Undo|Redo)$/ })).toHaveCount(0);

  await panel.getByRole("button", { name: "Background colour", exact: true }).click();
  await page.getByRole("button", { name: "#3b82f6", exact: true }).click();
  const changed = hexToRgb("#3b82f6");
  await expect.poll(() => computed(button, "background-color")).toBe(changed);
  await expect(undo).toBeEnabled();

  // Undo and Redo keep the element selected: the panel stays open and the outline stays on the button.
  await undo.click();
  await expect.poll(() => computed(button, "background-color")).toBe(original);
  await expect(panel).toBeVisible();
  await expectOutlineOn(app, button);
  await expect(panel.getByRole("textbox", { name: "Padding", exact: true })).toHaveValue("12");
  await expect(redo).toBeEnabled();
  await redo.click();
  await expect.poll(() => computed(button, "background-color")).toBe(changed);
  await expect(panel).toBeVisible();
  await expectOutlineOn(app, button);
  await expect(panel.getByRole("textbox", { name: "Padding", exact: true })).toHaveValue("12");
  await expect(undo).toBeEnabled();
  await expect(redo).toBeDisabled();
});

test("the pill's Undo works with nothing selected and no panel", async ({ page, baseURL }) => {
  const { button, panel } = await openRedButton(page, baseURL!);
  const original = await computed(button, "background-color");
  await selectRedButton(page, button, panel);
  await panel.getByRole("button", { name: "Background colour", exact: true }).click();
  await page.getByRole("button", { name: "#3b82f6", exact: true }).click();
  const changed = hexToRgb("#3b82f6");
  await expect.poll(() => computed(button, "background-color")).toBe(changed);
  // Picking the swatch closed the popup; Escape clears the selection and the panel goes.
  await expect(page.getByRole("textbox", { name: "Hex", exact: true })).toHaveCount(0);
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(pillButton(page, "Edit")).toHaveAttribute("aria-pressed", "true");
  await pillButton(page, "Undo").click();
  await expect.poll(() => computed(button, "background-color")).toBe(original);
  await expect(panel).toHaveCount(0);
  await pillButton(page, "Redo").click();
  await expect.poll(() => computed(button, "background-color")).toBe(changed);
  await expect(panel).toHaveCount(0);
});

test("the panel header is just the Tweak and Code tabs and Close", async ({ page, baseURL }) => {
  const { button, panel } = await openRedButton(page, baseURL!);
  await selectRedButton(page, button, panel);
  const header = panel.locator(":scope > :first-child");
  await expect(header.getByRole("tab")).toHaveText(["Tweak", "Code"]);
  await expect(header.getByRole("button")).toHaveCount(1);
  await expect(header.getByRole("button", { name: "Close", exact: true })).toBeVisible();
  // No title, no Undo/Redo, no Interact or Edit toggle anywhere in the panel.
  expect((await header.innerText()).replace(/\s+/g, " ").trim()).toBe("Tweak Code");
  await expect(panel.getByRole("button", { name: /^(Undo|Redo|Interact|Edit)$/ })).toHaveCount(0);
  await expect(page.getByTestId("interact-chip")).toHaveCount(0);
  await expect(page.getByText("Interacting", { exact: true })).toHaveCount(0);
});

test("the inspector has no element-name line, no Showing:, no auto text and no Add to chat", async ({ page, baseURL }) => {
  const { button, panel } = await openRedButton(page, baseURL!);
  await selectRedButton(page, button, panel);
  await expect(panel.getByRole("textbox", { name: "Padding", exact: true })).toHaveValue("12");
  const body = panel.locator(".orion-i-body");
  // The first thing in the body is the first section's title, with no element name above it.
  expect((await body.innerText()).trim().split("\n")[0]).toBe("Content");
  await expect(panel).not.toContainText("Showing");
  expect(await body.innerText()).not.toMatch(/\bauto\b/i);
  await expect(panel).not.toContainText("Add to chat");
  await expect(page.getByRole("button", { name: /Add to chat/ })).toHaveCount(0);
  // Auto size is an icon with a tooltip, not text.
  // The red button sizes itself, so both Width and Height show it.
  const autoIcons = panel.getByRole("img", { name: "Auto size" });
  await expect(autoIcons).toHaveCount(2);
  for (const icon of await autoIcons.all()) await expect(icon).toHaveAttribute("title", "Auto size");
});

test("every field in the Tweak panel shares one height, background, radius and padding", async ({ page, baseURL }) => {
  const { button, panel } = await openRedButton(page, baseURL!);
  await selectRedButton(page, button, panel);
  await expect(panel.getByRole("textbox", { name: "Padding", exact: true })).toHaveValue("12");
  const looks = await panel.locator(".orion-i-body").evaluate((body) => {
    const colourRows = ["Text colour", "Background colour"].map((name) => body.querySelector(`button[aria-label="${name}"]`));
    // The colour popups' own Hex boxes live in their (closed) popovers, not in the panel's field rows.
    const inPopup = (element: Element) => element.closest('[popover], [role="dialog"]') !== null;
    const inputs = [...body.querySelectorAll("input")].filter((input) => !inPopup(input));
    const controls = [...inputs, ...body.querySelectorAll('[role="combobox"]'), ...colourRows];
    return controls.map((control) => {
      // Every control sits in its field row root; the root draws the field.
      const root = control?.closest(".orion-i-field");
      if (!control || !root) return { kind: control?.getAttribute("aria-label") ?? "missing", look: "no field root" };
      const style = getComputedStyle(root);
      // The control itself fills its field and draws nothing of its own.
      const own = getComputedStyle(control);
      return {
        kind: control.getAttribute("role") ?? control.tagName.toLowerCase(),
        look: [style.height, style.backgroundColor, style.borderRadius, style.paddingLeft, style.paddingRight].join(" | "),
        inner: [own.height, own.backgroundColor].join(" | "),
      };
    });
  });
  // All three kinds are present: text inputs, dropdowns and colour rows.
  expect(new Set(looks.map((item) => item.kind)), JSON.stringify(looks)).toEqual(new Set(["input", "combobox", "button"]));
  expect(looks.length).toBeGreaterThanOrEqual(8);
  expect(new Set(looks.map((item) => item.look)).size, JSON.stringify(looks)).toBe(1);
  expect(looks[0]!.look.startsWith("34px")).toBe(true);
  // Every inner control (input, dropdown button, colour button) is the field's full height and transparent.
  expect(new Set(looks.map((item) => item.inner)), JSON.stringify(looks)).toEqual(new Set(["34px | rgba(0, 0, 0, 0)"]));
});

test("Code view has line numbers, syntax colours, and Copy and Download but no Undo or Redo in its top bar", async ({ page, baseURL }) => {
  const { panel } = await openRedButton(page, baseURL!);
  await openCode(page);
  const editor = panel.getByRole("textbox", { name: "Source for App.tsx" });
  await expect(editor).toBeVisible();
  await expect(panel.locator(".cm-lineNumbers")).toBeVisible();
  const colours = async () =>
    new Set(await panel.locator(".cm-line").first().locator("span").evaluateAll((spans) => spans.map((span) => getComputedStyle(span).color)));
  await expect.poll(async () => (await colours()).size).toBeGreaterThanOrEqual(2);

  const copy = panel.getByRole("button", { name: "Copy", exact: true });
  await expect(copy).toBeVisible();
  const topBar = copy.locator("xpath=../..");
  await expect(topBar.getByRole("button", { name: "Download", exact: true })).toBeVisible();
  await expect(topBar.getByRole("button", { name: /^(Undo|Redo)$/ })).toHaveCount(0);
  // The only Undo and Redo are the pill's: none anywhere in the panel.
  await expect(panel.getByRole("button", { name: /^(Undo|Redo)$/ })).toHaveCount(0);
  await expect(pillButton(page, "Undo")).toHaveCount(1);
  await expect(pillButton(page, "Redo")).toHaveCount(1);
});

test("a read-only board opens a woken screen's Code, since there is nothing to select", async ({ page }) => {
  await page.goto(`${route}?access=view`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.evaluate(() => window.__orionBoard!.addFixture("sample"));
  await doubleClickScreen(page, "welcome");
  await expect(page.locator('iframe[data-orion-live="welcome"]')).toBeVisible();
  const panel = page.getByTestId("live-panel");
  await expect(panel).toBeVisible();
  await expect(tab(panel, "Code")).toHaveAttribute("aria-selected", "true");
  await expect(panel).toContainText("index.html");
  const tweak = tab(panel, "Tweak");
  await expect(tweak).toHaveAttribute("aria-disabled", "true");
  // A person can still click it (it is aria-disabled, not removed): nothing happens.
  await tweak.click({ force: true });
  await expect(tab(panel, "Code")).toHaveAttribute("aria-selected", "true");
});

test("the Tweak tab is disabled with nothing selected, and choosing it keeps Code open", async ({ page, baseURL }) => {
  const { panel } = await openRedButton(page, baseURL!);
  await openCode(page);
  const tweak = tab(panel, "Tweak");
  await expect(tweak).toHaveAttribute("aria-disabled", "true");
  await expect(tweak).toHaveAccessibleDescription("Click something in the screen to tweak it");
  await tweak.click({ force: true });
  await expect(panel).toBeVisible();
  await expect(tab(panel, "Code")).toHaveAttribute("aria-selected", "true");
});

test("Escape order: a popup first, then the selection, then Edit, then the screen sleeps", async ({ page, baseURL }) => {
  const { live, button, panel } = await openRedButton(page, baseURL!);
  await selectRedButton(page, button, panel);
  const edit = pillButton(page, "Edit");
  // 1. Inside the Font dropdown: closes the list only.
  await panel.getByRole("combobox", { name: "Font", exact: true }).click();
  const list = page.getByRole("listbox", { name: "Font", exact: true });
  await expect(list).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(list).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(edit).toHaveAttribute("aria-pressed", "true");
  // 1b. Inside the colour popup: closes the popup only.
  await panel.getByRole("button", { name: "Background colour", exact: true }).click();
  const hex = page.getByRole("textbox", { name: "Hex", exact: true });
  await expect(hex).toBeVisible();
  await page.keyboard.press("Escape");
  await expect(hex).toHaveCount(0);
  await expect(panel).toBeVisible();
  await expect(edit).toHaveAttribute("aria-pressed", "true");
  // 2. The selection is cleared; still in Edit.
  await page.keyboard.press("Escape");
  await expect(panel).toHaveCount(0);
  await expect(edit).toHaveAttribute("aria-pressed", "true");
  await expect(live).toHaveCount(1);
  // 3. Edit ends; the screen stays awake.
  await page.keyboard.press("Escape");
  await expect(edit).toHaveAttribute("aria-pressed", "false");
  await expect(live).toHaveCount(1);
  // 4. The screen sleeps.
  await page.keyboard.press("Escape");
  await expect(live).toHaveCount(0);
});
