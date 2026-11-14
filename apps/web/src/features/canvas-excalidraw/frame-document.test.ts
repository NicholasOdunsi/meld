import { describe, expect, it } from "vitest";
import { buildFrameDocument, FRAME_CSP, FRAME_MESSAGE_SOURCE, FRAME_SANDBOX } from "./frame-document";

describe("buildFrameDocument", () => {
  it("puts the CSP meta first in an existing head", () => {
    const doc = buildFrameDocument("<!doctype html><html><head><title>T</title></head><body>x</body></html>");
    const head = doc.slice(doc.indexOf("<head>") + 6);
    expect(head.startsWith('<meta http-equiv="Content-Security-Policy"')).toBe(true);
    expect(doc).toContain("<title>T</title>");
  });

  it("adds a head when the page has an html tag but no head", () => {
    const doc = buildFrameDocument("<html><body>x</body></html>");
    expect(doc).toMatch(/<html><head><meta http-equiv="Content-Security-Policy"/);
  });

  it("wraps a fragment in a full document", () => {
    const doc = buildFrameDocument("<h1>Hi</h1>");
    expect(doc.startsWith("<!doctype html><html><head>")).toBe(true);
    expect(doc).toContain("<body><h1>Hi</h1></body>");
  });

  it("keeps the page's own script", () => {
    const doc = buildFrameDocument("<html><head></head><body><script>window.ran=1</script></body></html>");
    expect(doc).toContain("<script>window.ran=1</script>");
  });

  it("does not interpret $ patterns in page content", () => {
    const doc = buildFrameDocument("<html><head><title>$&$1</title></head><body></body></html>");
    expect(doc).toContain("<title>$&$1</title>");
  });

  it("blocks network and outside code but allows inline script and style", () => {
    expect(FRAME_CSP).toContain("connect-src 'none'");
    expect(FRAME_CSP).toContain("default-src 'none'");
    expect(FRAME_CSP).toContain("script-src 'unsafe-inline'");
    expect(FRAME_CSP).toContain("form-action 'none'");
    expect(FRAME_CSP).toContain("base-uri 'none'");
    expect(FRAME_CSP).not.toContain("unsafe-eval");
  });

  it("installs a goto bridge that posts the agreed message source", () => {
    const doc = buildFrameDocument("<h1>Hi</h1>");
    expect(doc).toContain(FRAME_MESSAGE_SOURCE);
    expect(doc).toContain("data-goto");
  });

  it("grants scripts only", () => {
    expect(FRAME_SANDBOX).toBe("allow-scripts");
  });
});
