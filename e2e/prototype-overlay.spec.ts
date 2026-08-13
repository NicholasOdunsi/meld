import { expect, test } from "@playwright/test";
import { buildPrototypeDocument } from "@meld/prototype";

const SCREEN_ID = "11111111-1111-4111-8111-111111111111";

test("an inert overlay tracks camera movement without drifting", async ({ page }) => {
  const document = buildPrototypeDocument({
    startScreenId: SCREEN_ID,
    tokenCss: "",
    screens: [
      {
        id: SCREEN_ID,
        name: "Overlay",
        markup: "<h1>Screen</h1><p>body copy</p>",
        styles: "h1 { font-size: 20px; }",
        script: null,
        actions: [],
      },
    ],
  });

  const documentHtml = document;

  await page.setContent(`
    <!DOCTYPE html><html><head><style>
      body { margin: 0; height: 100vh; overflow: hidden; }
      #stage { position: relative; width: 100vw; height: 100vh; }
      #overlay {
        position: absolute; top: 0; left: 0; width: 390px; height: 844px;
        transform-origin: 0 0; border: 0;
      }
    </style></head><body>
      <main id="stage"><iframe id="overlay" sandbox=""></iframe></main>
    </body></html>
  `);

  // Set the overlay srcdoc and define the placement function via evaluation.
  await page.evaluate((htmlContent: string) => {
    document.getElementById("overlay")!.srcdoc = htmlContent;
    window.__place = function (x: number, y: number, zoom: number) {
      document.getElementById("overlay")!.style.transform =
        "translate(" + x + "px," + y + "px) scale(" + zoom + ")";
    };
  }, documentHtml);

  // 120 camera updates: a pan-and-zoom gesture's worth.
  const measurement = await page.evaluate(async () => {
    const place = (window as never as { __place: (x: number, y: number, z: number) => void }).__place;
    const started = performance.now();
    for (let step = 0; step < 120; step += 1) {
      place(step * 2, step, 1 + step / 240);
      await new Promise((resolve) => requestAnimationFrame(resolve));
    }
    const elapsed = performance.now() - started;
    const overlay = document.getElementById("overlay") as HTMLIFrameElement;
    const box = overlay.getBoundingClientRect();
    return { elapsed, left: box.left, top: box.top };
  });

  // The overlay must land exactly where the camera put it — no accumulated drift.
  expect(measurement.left).toBeCloseTo(238, 0);
  expect(measurement.top).toBeCloseTo(119, 0);

  // 120 frames at 60fps is 2000ms. Anything near that means we are frame-bound.
  expect(measurement.elapsed).toBeLessThan(4_000);
  console.log(`overlay: 120 camera updates in ${Math.round(measurement.elapsed)}ms`);
});
