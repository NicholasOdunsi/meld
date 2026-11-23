import { expect, test, type Page } from "@playwright/test";

// Headless Chromium hides scrollbars (--hide-scrollbars); the owner sees the classic ones, so show them.
// This is its own spec because launch options cannot change inside a describe of another file.
test.use({
  viewport: { width: 1440, height: 1000 },
  permissions: ["clipboard-read", "clipboard-write"],
  launchOptions: { ignoreDefaultArgs: ["--hide-scrollbars"] },
});

const route = "/dev/canvas-excalidraw";
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

async function pasteCode(page: Page, code: string, device: "Phone" | "Tablet" | "Desktop") {
  await page.getByTestId("canvas-dock").getByRole("button", { name: "Code" }).click();
  const dialog = page.getByRole("dialog");
  await dialog.getByRole("radio", { name: device }).click();
  await dialog.getByLabel("Code").fill(code);
  await dialog.getByRole("button", { name: "Create", exact: true }).click();
  return dialog;
}

const darkTallPage = `<style>body{background:#101010;color:#fff}</style><main>${Array.from({ length: 30 }, (_, index) => `<section style="height:200px"><h2>Section ${index}</h2></section>`).join("")}</main>`;
// The rightmost columns of the frame's picture, read back as pixels. A transparent track shows what
// is behind the scrollbar, which is the iframe element's own background, so "no band" means the
// track pixels (below the thumb) all equal that colour; the thumb pixels (top) must differ from it.
async function scrollbarPixels(page: Page, frame: ReturnType<Page["locator"]>) {
  const png = (await frame.screenshot()).toString("base64");
  const background = (await frame.evaluate((element) => getComputedStyle(element).backgroundColor)).match(/\d+(\.\d+)?/g)!.slice(0, 3).map(Number);
  return page.evaluate(async ({ png, background }) => {
    const image = new Image();
    image.src = `data:image/png;base64,${png}`;
    await image.decode();
    const canvas = document.createElement("canvas");
    canvas.width = image.width;
    canvas.height = image.height;
    const context = canvas.getContext("2d")!;
    context.drawImage(image, 0, 0);
    const differs = (x: number, y: number) => {
      const [r, g, b] = context.getImageData(x, y, 1, 1).data;
      return Math.max(Math.abs(r - background[0]), Math.abs(g - background[1]), Math.abs(b - background[2])) > 6;
    };
    // The bar is 8px wide: a 2px transparent border each side of the 4px thumb.
    let track = 0;
    let thumb = 0;
    for (let x = image.width - 2; x < image.width; x++) {
      for (let y = Math.round(image.height * 0.6); y < image.height; y++) if (differs(x, y)) track++;
    }
    for (let x = image.width - 6; x < image.width - 2; x++) {
      for (let y = 0; y < Math.round(image.height * 0.05); y++) if (differs(x, y)) thumb++;
    }
    return { track, thumb, width: image.width, height: image.height };
  }, { png, background });
}

test("has no background band behind a thin thumb, awake and asleep, and no id tooltip", async ({ page, baseURL }) => {
  await openRoomBoard(page, baseURL!);
  await pasteCode(page, darkTallPage, "Desktop");
  const live = page.locator("iframe[data-orion-live]");
  await expect(page.frameLocator("iframe[data-orion-live]").getByText("Section 29")).toBeAttached();
  const id = (await live.getAttribute("data-orion-live"))!;
  // The screen's page really scrolls with a classic scrollbar, and ours is not wider than the browser's 15px.
  const metrics = await (await (await live.elementHandle())!.contentFrame())!.evaluate(
    () => ({ bar: window.innerWidth - document.documentElement.clientWidth, scrolls: document.documentElement.scrollHeight > window.innerHeight }),
  );
  expect(metrics.scrolls).toBe(true);
  expect(metrics.bar).toBeGreaterThan(0);
  expect(metrics.bar).toBeLessThan(15);

  // No native tooltip: the frame has no title (it would show the screen id) but keeps an accessible name.
  await expect(live).not.toHaveAttribute("title", /.*/);
  await expect(live).toHaveAttribute("aria-label", "Live screen");
  expect(await live.getAttribute("aria-label")).not.toContain(id);

  await page.mouse.move(0, 0);
  const awake = await scrollbarPixels(page, live);
  await live.screenshot({ path: ".context/fu-scroll-awake-right-edge.png" });
  expect(awake.track).toBe(0);
  expect(awake.thumb).toBeGreaterThan(0);

  // The sleeping picture of the same screen has the same quiet bar.
  await page.frameLocator("iframe[data-orion-live]").getByRole("heading", { name: "Section 1", exact: true }).click();
  await page.keyboard.press("Escape");
  const thumbnail = page.locator(`iframe[data-orion-frame="${id}"]`);
  await expect(thumbnail).toBeVisible();
  await expect(thumbnail).not.toHaveAttribute("title", /.*/);
  await expect(thumbnail).toHaveAttribute("aria-label", "Screen");
  const asleep = await scrollbarPixels(page, thumbnail);
  await thumbnail.screenshot({ path: ".context/fu-scroll-asleep-right-edge.png" });
  expect(asleep.track).toBe(0);
  expect(asleep.thumb).toBeGreaterThan(0);
});
