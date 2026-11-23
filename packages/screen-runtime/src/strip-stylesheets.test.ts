import { describe, expect, it } from "vitest";
import { stripExternalStylesheets } from "./strip-stylesheets";

describe("stripExternalStylesheets", () => {
  it("returns the html untouched when there is nothing to strip", () => {
    const html = "<style>p{}</style><link rel=\"icon\" href=\"/x.png\"><p>Hi</p>";
    expect(stripExternalStylesheets(html)).toEqual({ html, removed: [] });
  });
  it("removes stylesheet links and reports their hrefs in order", () => {
    const html = '<head>\n<link href="https://fonts.googleapis.com/css2?family=DM+Sans" rel="stylesheet">\n<link rel="STYLESHEET preload" href="/a.css"/>\n<style>p{}</style></head><body><p>Hi</p></body>';
    expect(stripExternalStylesheets(html)).toEqual({
      html: "<head>\n\n\n<style>p{}</style></head><body><p>Hi</p></body>",
      removed: ["https://fonts.googleapis.com/css2?family=DM+Sans", "/a.css"],
    });
  });
  it("keeps non-stylesheet links and ignores link-like text in scripts and comments", () => {
    const html = '<!-- <link rel="stylesheet" href="no.css"> --><link rel="preconnect" href="https://x.test"><script>var s = \'<link rel="stylesheet" href="y.css">\';</script>';
    expect(stripExternalStylesheets(html)).toEqual({ html, removed: [] });
  });
  it("removes stylesheet links inside templates", () => {
    expect(stripExternalStylesheets('<template><link rel="stylesheet" href="t.css"><p>x</p></template>')).toEqual({
      html: "<template><p>x</p></template>", removed: ["t.css"],
    });
  });
});
