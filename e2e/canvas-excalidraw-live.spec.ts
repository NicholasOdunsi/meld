import { expect, test, type Page } from "@playwright/test";

const route = "/dev/canvas-excalidraw";

async function addFixture(page: Page, key: "sample" | "loop") {
  await page.goto(route);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await page.evaluate((fixture) => window.__orionBoard!.addFixture(fixture), key);
}

async function doubleClickScreen(page: Page, screenId: string) {
  const thumbnail = page.locator(`iframe[data-orion-frame="${screenId}"]`);
  await expect(thumbnail).toBeVisible();
  const box = (await thumbnail.boundingBox())!;
  await page.mouse.dblclick(box.x + box.width / 2, box.y + box.height / 2);
}

test("double-click wakes a screen with its scripts, and Escape puts it back to sleep", async ({ page }) => {
  await addFixture(page, "sample");
  await doubleClickScreen(page, "welcome");
  const live = page.locator('iframe[data-orion-live="welcome"]');
  const livePage = page.frameLocator('iframe[data-orion-live="welcome"]');
  await expect(live).toBeVisible();
  await expect(livePage.getByText("script ran")).toBeVisible();
  expect(await live.evaluate((frame) => getComputedStyle(frame).outlineStyle)).toBe("solid");
  await livePage.getByRole("button", { name: "Log in" }).click();
  await page.keyboard.press("Escape");
  await expect(live).toHaveCount(0);
  // A board-only screen keeps its own HTML: no snapshot replaces it.
  expect(await page.locator('iframe[data-orion-frame="welcome"]').getAttribute("srcdoc")).toContain("script has not run");
});

async function selectScreen(page: Page) {
  await page.evaluate(() => {
    const api = window.__orionBoard!.api;
    const frame = api.getSceneElements().find((element) => element.type === "embeddable")!;
    api.updateScene({ appState: { selectedElementIds: { [frame.id]: true } } });
  });
}

test("the pill's Open live wakes the selected screen", async ({ page }) => {
  await addFixture(page, "sample");
  await selectScreen(page);
  await page.getByTestId("selection-pill").getByRole("button", { name: "Open live" }).click();
  await expect(page.locator('iframe[data-orion-live="welcome"]')).toBeVisible();
  const pill = page.getByTestId("selection-pill");
  await expect(pill.getByRole("button", { name: "Open live" })).toHaveCount(0);
  await pill.getByRole("button", { name: "Code", exact: true }).click();
  await expect(page.getByTestId("live-panel")).toContainText("index.html");
  await page.keyboard.press("Escape");
  await expect(page.getByTestId("live-panel")).toHaveCount(0);
});

test("an endless loop shows the stopped overlay and the board keeps working", async ({ page }) => {
  await addFixture(page, "loop");
  await doubleClickScreen(page, "loop");
  await expect(page.getByText("This screen stopped responding")).toBeVisible();
  await expect(page.locator("iframe[data-orion-live]")).toHaveCount(0);
  const zoom = () => page.evaluate(() => window.__orionBoard!.api.getAppState().zoom.value);
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

test("duplicate frames for one screen wake only the clicked copy", async ({ page }) => {
  await addFixture(page, "sample");
  await page.evaluate(() => window.__orionBoard!.addFixture("sample"));
  const thumbnails = page.locator('iframe[data-orion-frame="welcome"]');
  await expect(thumbnails).toHaveCount(2);
  const target = (await thumbnails.last().boundingBox())!;
  await page.mouse.dblclick(target.x + target.width / 2, target.y + target.height / 2);
  const live = page.locator('iframe[data-orion-live="welcome"]');
  await expect(live).toHaveCount(1);
  await expect(thumbnails).toHaveCount(1);
  expect((await live.boundingBox())!.x).toBeCloseTo(target.x);

  const other = (await thumbnails.boundingBox())!;
  await page.mouse.dblclick(other.x + other.width / 2, other.y + other.height / 2);
  await expect(live).toHaveCount(1);
  await expect.poll(async () => (await live.boundingBox())?.x).toBeCloseTo(other.x);
  await expect(thumbnails).toHaveCount(1);
});

test("a compile failure opens Code and keeps the static picture", async ({ page }) => {
  await addFixture(page, "sample");
  await page.evaluate(() => window.__orionBoard!.setScreen("welcome", "<h1>Picture</h1><script>const = 1;</script>"));
  await doubleClickScreen(page, "welcome");
  await expect(page.getByTestId("live-panel")).toContainText("Unexpected token");
  await expect(page.locator('iframe[data-orion-frame="welcome"]')).toBeVisible();
  await expect(page.locator("iframe[data-orion-live]")).toHaveCount(0);
});

test("a delayed Code action cannot reopen the panel after reopening the same frame", async ({ page }) => {
  let releaseRuntime!: () => void;
  const runtimeBlocked = new Promise<void>((resolve) => { releaseRuntime = resolve; });
  await page.route("**/screen-runtime/runtime.js", async (route) => {
    await runtimeBlocked;
    await route.continue();
  });
  try {
    await addFixture(page, "sample");
    await selectScreen(page);
    const pill = page.getByTestId("selection-pill");
    const runtimeRequested = page.waitForRequest("**/screen-runtime/runtime.js");
    await pill.getByRole("button", { name: "Code", exact: true }).click();
    await runtimeRequested;
    await page.keyboard.press("Escape");
    await selectScreen(page);
    await pill.getByRole("button", { name: "Open live" }).click();
    releaseRuntime();

    await expect(page.frameLocator('iframe[data-orion-live="welcome"]').getByText("script ran")).toBeVisible();
    await expect(page.getByTestId("live-panel")).toHaveCount(0);
  } finally {
    releaseRuntime();
  }
});

const roomId = "40000000-0000-4000-8000-000000000001";

async function openRoomBoard(page: Page, baseURL: string) {
  await page.context().addCookies([
    { name: "meld-e2e-user-id", value: "10000000-0000-4000-8000-000000000001", url: baseURL },
    { name: "meld-e2e-user-email", value: "owner@example.com", url: baseURL },
    { name: "meld-e2e-user-name", value: "Owner Example", url: baseURL },
  ]);
  await page.goto(`${route}?room=${roomId}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
}

async function pasteCode(page: Page, code: string, name: string, device: "Phone" | "Tablet" | "Desktop") {
  await page.getByTestId("canvas-dock").getByRole("button", { name: "Code" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByLabel("Code").fill(code);
  await dialog.getByLabel("Name").fill(name);
  await dialog.getByRole("radio", { name: device }).click();
  await dialog.getByRole("button", { name: "Create screen" }).click();
  return dialog;
}

const embeddableCount = (page: Page) => page.evaluate(() =>
  window.__orionBoard!.api.getSceneElements().filter((element) => element.type === "embeddable").length);

test("pasted React goes live, works, sleeps to a script-free picture and wakes again", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, `import { useState } from "react";
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
}`, "Counter", "Phone");
  const liveFrame = page.locator("iframe[data-orion-live]");
  await expect(liveFrame).toBeVisible();
  const screenId = (await liveFrame.getAttribute("data-orion-live"))!;
  expect(screenId).toMatch(/^ds-/);
  const app = page.frameLocator("iframe[data-orion-live]");
  await app.getByRole("button", { name: /Count 0/ }).click();
  await expect(app.getByRole("button", { name: /Count 1/ })).toBeVisible();
  // Tailwind ran inside the frame.
  expect(await app.getByRole("button").evaluate((button) => getComputedStyle(button).borderTopLeftRadius)).not.toBe("0px");
  // Focus is inside the frame: the bridge forwards Escape.
  await page.keyboard.press("Escape");
  await expect(liveFrame).toHaveCount(0);
  const thumbnail = page.locator(`iframe[data-orion-frame="${screenId}"]`);
  await expect.poll(() => thumbnail.getAttribute("srcdoc")).toContain("Count 1");
  const srcdoc = (await thumbnail.getAttribute("srcdoc"))!;
  expect(srcdoc).not.toContain("<script");
  expect(srcdoc).not.toContain("data-orion-src");
  await doubleClickScreen(page, screenId);
  await expect(page.frameLocator("iframe[data-orion-live]").getByRole("button", { name: /Count 0/ })).toBeVisible();
});

test("a pasted endless loop shows the stopped overlay and Reload brings it back", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, "export default function App() {\n  return <button onClick={() => { while (true) {} }}>Freeze</button>;\n}", "Freeze", "Phone");
  await page.frameLocator("iframe[data-orion-live]").getByRole("button", { name: "Freeze" }).click();
  await expect(page.getByText("This screen stopped responding")).toBeVisible();
  await page.getByRole("button", { name: "Zoom in" }).click();
  await page.getByRole("button", { name: "Reload" }).click();
  await expect(page.frameLocator("iframe[data-orion-live]").getByRole("button", { name: "Freeze" })).toBeVisible();
});

test("pasted HTML runs its inline handlers", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, `<main><button onclick="this.textContent = 'Clicked'">Press</button></main>`, "Plain", "Desktop");
  const app = page.frameLocator("iframe[data-orion-live]");
  await app.getByRole("button", { name: "Press" }).click();
  await expect(app.getByRole("button", { name: "Clicked" })).toBeVisible();
});

test("an unsupported package is named in the dialog and nothing is created", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  const before = await embeddableCount(page);
  const dialog = await pasteCode(page, 'import { motion } from "framer-motion";\nexport default function App() { return <motion.div>Hi</motion.div>; }', "Motion", "Phone");
  await expect(dialog.getByText("Unsupported package: framer-motion")).toBeVisible();
  expect(await embeddableCount(page)).toBe(before);
});
