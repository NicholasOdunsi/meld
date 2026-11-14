import { test, expect, type Page } from "@playwright/test";

// The existing in-memory fake room (apps/web/src/features/rooms/e2e-fake.ts)
// and its owner, who the fake requires as a signed-in cookie user.
const FAKE_ROOM = "40000000-0000-4000-8000-000000000001";
const OWNER_ID = "10000000-0000-4000-8000-000000000001";

async function drawSketchFrame(page: Page) {
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
}

test("with a room, the owner's AI builds the screen through the existing queue", async ({ page, context, baseURL }) => {
  await context.addCookies([
    { name: "meld-e2e-user-id", value: OWNER_ID, url: baseURL! },
    { name: "meld-e2e-user-email", value: "owner@example.com", url: baseURL! },
    { name: "meld-e2e-user-name", value: "Owner Example", url: baseURL! },
  ]);
  await page.goto(`/dev/canvas-excalidraw?room=${FAKE_ROOM}`);
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await drawSketchFrame(page);
  await page.getByRole("textbox", { name: "Describe this screen" }).fill("A login screen");
  await page.getByRole("button", { name: "Build screen" }).click();
  await expect(page.locator('iframe[data-orion-frame^="own-"]')).toBeVisible({ timeout: 60_000 });
  await expect(page.getByText("Built with your AI (codex).")).toBeVisible();
  // The fake queue renders the screen's name and the owner's words into the page,
  // so this proves the page was assembled and loaded, not just that a frame appeared.
  const built = page.frameLocator('iframe[data-orion-frame^="own-"]');
  await expect(built.getByRole("heading", { name: "Sketch screen" })).toBeVisible();
  await expect(built.getByText(/A login screen/)).toBeVisible();
});

test("without a room, DeepSeek builds it and says why", async ({ page }) => {
  await page.goto("/dev/canvas-excalidraw");
  await expect(page.locator("canvas.excalidraw__canvas").first()).toBeVisible();
  await drawSketchFrame(page);
  await page.getByRole("button", { name: "Build screen" }).click();
  await expect(page.locator('iframe[data-orion-frame^="generated-"]')).toBeVisible();
  await expect(page.getByText("No AI of yours is connected here, so DeepSeek built this screen.")).toBeVisible();
});
