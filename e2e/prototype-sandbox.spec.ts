import { createServer, type Server } from "node:http";
import { type AddressInfo } from "node:net";
import { expect, test } from "@playwright/test";
import { buildPrototypeDocument } from "@meld/prototype";

const SCREEN_ID = "11111111-1111-4111-8111-111111111111";

let server: Server;
let captured: string[] = [];
let origin = "";

test.beforeAll(async () => {
  server = createServer((request, response) => {
    captured.push(request.url ?? "");
    response.writeHead(200, { "access-control-allow-origin": "*" });
    response.end("ok");
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => server.close(() => resolve()));
});

test.beforeEach(() => {
  captured = [];
});

// Every attempt reports itself back through postMessage, which the sandbox does
// not block — that is how the test learns the outcome of code it cannot inspect.
function escapeScript(target: string): string {
  return `
    var results = [];
    function attempt(name, run) {
      try { run(); results.push({ name: name, threw: false }); }
      catch (error) { results.push({ name: name, threw: true }); }
    }
    attempt("fetch", function () { fetch("${target}/fetch"); });
    attempt("xhr", function () {
      var request = new XMLHttpRequest();
      request.open("GET", "${target}/xhr");
      request.send();
    });
    attempt("websocket", function () {
      new WebSocket("${target.replace("http", "ws")}/ws");
    });
    attempt("eventsource", function () { new EventSource("${target}/sse"); });
    attempt("beacon", function () {
      var image = document.createElement("img");
      image.src = "${target}/beacon.png";
      document.body.appendChild(image);
    });
    attempt("form-submit", function () {
      var form = document.createElement("form");
      form.action = "${target}/form";
      form.method = "POST";
      document.body.appendChild(form);
      form.submit();
    });
    attempt("top-navigation", function () { top.location = "${target}/top"; });
    attempt("parent-dom", function () { void parent.document.title; });
    attempt("local-storage", function () { localStorage.setItem("k", "v"); });
    attempt("cookie", function () { document.cookie = "k=v"; });
    attempt("window-open", function () { window.open("${target}/popup"); });
    setTimeout(function () {
      parent.postMessage(JSON.stringify(results), "*");
    }, 250);
  `;
}

async function runEscapeMatrix(page: import("@playwright/test").Page) {
  const document = buildPrototypeDocument({
    startScreenId: SCREEN_ID,
    tokenCss: "",
    screens: [
      {
        id: SCREEN_ID,
        name: "Escape",
        markup: "<p>escape matrix</p>",
        styles: "",
        script: escapeScript(origin),
        actions: [],
      },
    ],
  });

  await page.setContent(`
    <!DOCTYPE html><html><body>
    <iframe id="frame" sandbox="allow-scripts"></iframe>
    <script>
      window.__results = null;
      addEventListener("message", function (event) { window.__results = event.data; });
      // buildPrototypeDocument's harness always ends with a closing script
      // tag. Left unescaped inside this outer script element, the browser's
      // HTML tokenizer (not the JS engine) ends the tag right there and
      // corrupts the rest of the outer page, so the JSON string is escaped
      // below before it is interpolated.
      document.getElementById("frame").srcdoc = ${JSON.stringify(document).replace(/<\/script/gi, "<\\/script")};
    </script>
    </body></html>
  `);

  await page.waitForFunction(() => (window as never as { __results: string | null }).__results !== null);
  return JSON.parse(
    await page.evaluate(() => (window as never as { __results: string }).__results),
  ) as Array<{ name: string; threw: boolean }>;
}

test("no escape attempt reaches the network", async ({ page }) => {
  await runEscapeMatrix(page);
  // Give any in-flight request time to land before asserting the negative.
  await page.waitForTimeout(500);
  expect(captured).toEqual([]);
});

test("storage, cookies, parent DOM, and top navigation all throw", async ({ page }) => {
  const results = await runEscapeMatrix(page);
  const byName = new Map(results.map((result) => [result.name, result.threw]));

  expect(byName.get("parent-dom")).toBe(true);
  expect(byName.get("local-storage")).toBe(true);
  expect(byName.get("top-navigation")).toBe(true);
  expect(byName.get("cookie")).toBe(true);

  // Every attempt must have been made — a typo that skips one would otherwise
  // read as a pass.
  expect(results).toHaveLength(11);
});

test("an inert frame does not execute script at all", async ({ page }) => {
  const document = buildPrototypeDocument({
    startScreenId: SCREEN_ID,
    tokenCss: "",
    screens: [
      {
        id: SCREEN_ID,
        name: "Inert",
        markup: "<p>inert</p>",
        styles: "",
        script: `fetch("${origin}/inert"); document.title = "ran";`,
        actions: [],
      },
    ],
  });

  await page.setContent(`
    <!DOCTYPE html><html><body>
    <iframe id="frame" sandbox=""></iframe>
    <script>document.getElementById("frame").srcdoc = ${JSON.stringify(document).replace(/<\/script/gi, "<\\/script")};</script>
    </body></html>
  `);
  await page.waitForTimeout(750);

  expect(captured).toEqual([]);
  expect(await page.frameLocator("#frame").locator("p").innerText()).toBe("inert");
});

test("routing works inside the sandbox", async ({ page }) => {
  const second = "22222222-2222-4222-8222-222222222222";
  const document = buildPrototypeDocument({
    startScreenId: SCREEN_ID,
    tokenCss: "",
    screens: [
      {
        id: SCREEN_ID,
        name: "First",
        markup: '<button data-meld-action="go">Continue</button>',
        styles: "",
        script: null,
        actions: [{ id: "go", label: "Continue", targetScreenId: second }],
      },
      {
        id: second,
        name: "Second",
        markup: "<h1>Second screen</h1>",
        styles: "",
        script: null,
        actions: [],
      },
    ],
  });

  await page.setContent(`
    <!DOCTYPE html><html><body>
    <iframe id="frame" sandbox="allow-scripts" width="800" height="600"></iframe>
    <script>document.getElementById("frame").srcdoc = ${JSON.stringify(document).replace(/<\/script/gi, "<\\/script")};</script>
    </body></html>
  `);

  const frame = page.frameLocator("#frame");
  await expect(frame.locator("h1")).toBeHidden();
  await frame.locator("button").click();
  await expect(frame.locator("h1")).toHaveText("Second screen");
});
