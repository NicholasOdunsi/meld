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

async function selectScreen(page: Page) {
  await page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const frame = api
      .getSceneElements()
      .find((element) => element.type === "embeddable")!;
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
  });
}

test("the pill's Open live wakes the selected screen", async ({ page }) => {
  await addFixture(page, "sample");
  await selectScreen(page);
  await page
    .getByTestId("selection-pill")
    .getByRole("button", { name: "Open live" })
    .click();
  await expect(page.locator('iframe[data-orion-live="welcome"]')).toBeVisible();
  const pill = page.getByTestId("selection-pill");
  await expect(pill.getByRole("button", { name: "Open live" })).toHaveCount(0);
  // Waking a screen does not open the panel: it shows only once something is selected.
  await expect(page.getByTestId("live-panel")).toHaveCount(0);
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
    await addFixture(page, "sample");
    await selectScreen(page);
    const pill = page.getByTestId("selection-pill");
    const runtimeRequested = page.waitForRequest(
      "**/screen-runtime/runtime.js",
    );
    await pill.getByRole("button", { name: "Code", exact: true }).click();
    await runtimeRequested;
    await page.keyboard.press("Escape");
    await selectScreen(page);
    await pill.getByRole("button", { name: "Open live" }).click();
    releaseRuntime();

    await expect(
      page
        .frameLocator('iframe[data-orion-live="welcome"]')
        .getByText("script ran"),
    ).toBeVisible();
    // Waking opens no panel, and the abandoned Code action must not open one later.
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

// A pasted screen wakes without being selected on the board, and the pill (Interact,
// Code) belongs to the selected screen frame, so select the awake screen's frame.
async function selectLiveFrame(page: Page) {
  const id = (await page
    .locator("iframe[data-orion-live]")
    .getAttribute("data-orion-live"))!;
  await page.evaluate((screenId) => {
    const api = window.__orionBoard!.api;
    const frame = api
      .getSceneElements()
      .find(
        (element) =>
          element.type === "embeddable" && element.link?.endsWith(screenId),
      )!;
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
  }, id);
  await expect(page.getByTestId("selection-pill")).toBeVisible();
}

// Selecting is automatic for an awake, editable screen, so using it (clicking its
// buttons) first needs the pill's Interact toggle.
async function interact(page: Page) {
  await selectLiveFrame(page);
  await page
    .getByTestId("selection-pill")
    .getByRole("button", { name: "Interact", exact: true })
    .click();
}

// Opens the Code tab through the pill: waking a screen does not open the panel.
async function openCode(page: Page) {
  await selectLiveFrame(page);
  await page
    .getByTestId("selection-pill")
    .getByRole("button", { name: "Code", exact: true })
    .click();
}

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
  // Waking selects nothing and opens no panel; Interact lets the screen take the clicks.
  await expect(page.getByTestId("live-panel")).toHaveCount(0);
  await interact(page);
  await app.getByRole("button", { name: /Count 0/ }).click();
  await expect(app.getByRole("button", { name: /Count 1/ })).toBeVisible();
  // Tailwind ran inside the frame.
  expect(
    await app
      .getByRole("button")
      .evaluate((button) => getComputedStyle(button).borderTopLeftRadius),
  ).not.toBe("0px");
  // Focus is inside the frame: the bridge forwards Escape.
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
  await interact(page);
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
  await interact(page);
  await app.getByRole("button", { name: "Press" }).click();
  await expect(app.getByRole("button", { name: "Clicked" })).toBeVisible();
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
  // Clicking the element selects it (no Pick button) and shows the Tweak tab.
  await app.getByRole("button", { name: "Start", exact: true }).click();
  await expect(app.getByLabel("Count")).toHaveText("0");
  await expect(
    panel.getByRole("button", { name: "Tweak", exact: true }),
  ).toHaveAttribute("aria-current", "page");
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
  await panel.getByRole("button", { name: "Code", exact: true }).click();
  const copied = await copyActiveFile(page);
  expect(copied).toContain("bg-[#123456]");
  expect(copied).not.toContain("data-orion-src");
  expect(copied).not.toContain("__ORION");
  // The first Escape clears the selection; the second puts the screen to sleep.
  await page.keyboard.press("Escape");
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
  // The old frame is still awake: Interact hands its clicks back to the screen.
  await interact(page);
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
  await panel.getByRole("button", { name: "Undo", exact: true }).click();
  await expect(editor).toContainText("Broken");
  await panel.getByRole("button", { name: "Redo", exact: true }).click();
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
 // Clicking the element selects it (there is no Pick button) and shows the Tweak panel.
 await page.frameLocator('iframe[data-orion-live]').getByRole('button',{name:'Converted',exact:true}).click();
 await expect(panel.getByRole('textbox',{name:'Text',exact:true})).toBeEnabled();
 await page.screenshot({path:'.context/plan3-hand-editing.png',fullPage:true});
});
