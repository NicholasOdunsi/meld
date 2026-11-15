import { describe, expect, it } from "vitest";
import { buildBoardFrameDocument, BOARD_FRAME_CSP, BOARD_FRAME_SANDBOX, buildFrameDocument, FRAME_CSP, FRAME_MESSAGE_SOURCE, FRAME_SANDBOX } from "./frame-document";

const CSP_META = '<meta http-equiv="Content-Security-Policy"';

// The CSP must be the first thing the parser sees: its meta has to come before
// the page's own markup (and before any marker inside it, such as a comment,
// attribute value, script or head the page happens to contain).
function expectCspBefore(page: string, marker: string) {
  const doc = buildFrameDocument(page);
  const csp = doc.indexOf(CSP_META);
  expect(csp).toBeGreaterThanOrEqual(0);
  expect(csp).toBeLessThan(doc.indexOf(marker));
  return doc;
}

describe("buildFrameDocument", () => {
  it("puts the CSP meta before the page's own markup", () => {
    const doc = expectCspBefore(
      "<!doctype html><html><head><title>T</title></head><body>x</body></html>",
      "<title>T</title>",
    );
    expect(doc).toContain("<title>T</title>");
    expect(doc).toContain("<body>x</body>");
  });

  it("puts the CSP meta before an html tag that has no head", () => {
    const doc = expectCspBefore("<html><body>x</body></html>", "<html>");
    expect(doc).toContain("<body>x</body>");
  });

  it("keeps a fragment's content after the CSP meta", () => {
    const doc = buildFrameDocument("<h1>Hi</h1>");
    expect(doc.startsWith(`<!doctype html>${CSP_META}`)).toBe(true);
    expect(doc).toContain("<h1>Hi</h1>");
  });

  it("does not duplicate a leading doctype", () => {
    const doc = buildFrameDocument("\n  <!DOCTYPE html>\n<html><head></head><body>x</body></html>");
    expect(doc.match(/<!doctype/gi)).toHaveLength(1);
    expect(doc.startsWith("<!doctype html>")).toBe(true);
    expect(doc).toContain("<body>x</body>");
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

  it("is not fooled by a head inside an HTML comment", () => {
    expectCspBefore("<!-- <head> --><html><head></head><body>x</body></html>", "<!-- <head> -->");
  });

  it("is not fooled by a head inside an attribute value", () => {
    expectCspBefore('<html><body title="<head>">x</body></html>', 'title="<head>"');
  });

  it("runs before a script that sits ahead of the page's head", () => {
    expectCspBefore('<html><script>fetch("https://example.invalid")</script><head></head><body></body></html>', "<script>fetch");
  });

  it("handles an uppercase HEAD", () => {
    expectCspBefore("<HTML><HEAD><TITLE>T</TITLE></HEAD><BODY>x</BODY></HTML>", "<TITLE>T");
  });

  it("handles a head with attributes", () => {
    expectCspBefore('<html><head lang="en"><title>T</title></head><body>x</body></html>', "<title>T");
  });

  it("handles a header element before the head", () => {
    expectCspBefore("<header>Top</header><html><head><title>T</title></head><body></body></html>", "<header>Top");
  });

  it("handles a self-closing head", () => {
    expectCspBefore("<html><head/><title>T</title><body>x</body></html>", "<title>T");
  });
});

describe("buildBoardFrameDocument", () => {
  it("puts a no-script policy before untrusted content", () => {
    const doc = buildBoardFrameDocument('<!doctype html><script>while(true){}</script><h1>Safe preview</h1>');
    expect(doc.indexOf('script-src \'none\'')).toBeLessThan(doc.indexOf('<script>while(true){}'));
    expect(BOARD_FRAME_CSP).toContain("script-src 'none'");
    expect(BOARD_FRAME_SANDBOX).toBe("");
  });
});
