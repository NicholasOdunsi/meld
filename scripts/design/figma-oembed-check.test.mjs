import assert from "node:assert/strict";
import { createServer } from "node:http";
import test from "node:test";
import { fetchOembed, normalizeFigmaUrl } from "./figma-oembed-check.mjs";

test("normalizes a figma url and keeps only node-id", () => {
  assert.equal(
    normalizeFigmaUrl("https://WWW.Figma.com/design/abc123/Title?node-id=1-2&t=xyz#frame"),
    "https://www.figma.com/design/abc123/Title?node-id=1-2",
  );
});

test("accepts the bare figma.com host", () => {
  assert.equal(
    normalizeFigmaUrl("https://figma.com/file/abc123/Title"),
    "https://figma.com/file/abc123/Title",
  );
});

test("rejects a non-figma host", () => {
  assert.equal(normalizeFigmaUrl("https://figma.com.evil.test/file/abc"), null);
  assert.equal(normalizeFigmaUrl("https://notfigma.com/file/abc"), null);
});

test("rejects a non-https scheme", () => {
  assert.equal(normalizeFigmaUrl("http://www.figma.com/file/abc"), null);
});

test("reads a thumbnail from an oembed response", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(
      JSON.stringify({ title: "Pricing", thumbnail_url: "https://s3.figma.test/t.png" }),
    );
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const result = await fetchOembed("https://www.figma.com/file/abc/Title", { origin });
  assert.equal(result.ok, true);
  assert.equal(result.thumbnailUrl, "https://s3.figma.test/t.png");
  assert.equal(result.title, "Pricing");
  server.close();
});

test("reports a private file as not-ok without throwing", async () => {
  const server = createServer((request, response) => {
    response.writeHead(404, { "content-type": "application/json" });
    response.end("{}");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const result = await fetchOembed("https://www.figma.com/file/private/Title", { origin });
  assert.equal(result.ok, false);
  assert.equal(result.thumbnailUrl, null);
  assert.equal(result.status, 404);
  server.close();
});

test("refuses a response past the size limit", async () => {
  const server = createServer((request, response) => {
    response.writeHead(200, { "content-type": "application/json" });
    response.end(JSON.stringify({ title: "x".repeat(70 * 1024) }));
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;

  const result = await fetchOembed("https://www.figma.com/file/big/Title", { origin });
  assert.equal(result.ok, false);
  assert.equal(result.status, "too-large");
  server.close();
});
