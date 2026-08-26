import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildPrototypeDocument, PROTOTYPE_CSP } from "./prototype-document";

const SIGN_UP = "11111111-1111-4111-8111-111111111111";
const DASHBOARD = "22222222-2222-4222-8222-222222222222";

function input() {
  return {
    startScreenId: SIGN_UP,
    tokenCss: ":root { --meld-color-primary: #2f6feb; }",
    screens: [
      {
        id: SIGN_UP,
        name: "Sign up",
        markup: '<button data-meld-action="go">Continue</button>',
        styles: "button { padding: 8px; }",
        script: null,
        actions: [{ id: "go", label: "Continue", targetScreenId: DASHBOARD }],
      },
      {
        id: DASHBOARD,
        name: "Dashboard",
        markup: "<h1>Dashboard</h1>",
        styles: "h1 { font-size: 24px; }",
        script: null,
        actions: [],
      },
    ],
  };
}

function runHarnessClick(html: string, actionId: string, actionText = "Continue") {
  type FakeElement = {
    hidden?: boolean;
    parentElement: FakeElement | null;
    textContent?: string;
    hasAttribute(name: string): boolean;
    getAttribute(name: string): string | null;
  };

  const bodyAttributes = new Map([["data-meld-start", SIGN_UP]]);
  const body: FakeElement & {
    setAttribute(name: string, value: string): void;
    removeAttribute(name: string): void;
  } = {
    parentElement: null,
    hasAttribute: () => false,
    getAttribute: (name) => bodyAttributes.get(name) ?? null,
    setAttribute: (name, value) => bodyAttributes.set(name, value),
    removeAttribute: (name) => bodyAttributes.delete(name),
  };
  const screens = [SIGN_UP, DASHBOARD].map(
    (id): FakeElement => ({
      hidden: id !== SIGN_UP,
      parentElement: body,
      hasAttribute: (name) => name === "data-meld-screen",
      getAttribute: (name) => (name === "data-meld-screen" ? id : null),
    }),
  );
  const action: FakeElement = {
    parentElement: screens[0],
    textContent: actionText,
    hasAttribute: (name) => name === "data-meld-action",
    getAttribute: (name) => (name === "data-meld-action" ? actionId : null),
  };
  let click: ((event: { target: FakeElement; preventDefault(): void }) => void) | undefined;
  const routeJson = html.match(
    /<script type="application\/json" id="meld-routes">([\s\S]*?)<\/script>/,
  )?.[1];
  const harness = html.match(/<script>([\s\S]*?)<\/script>/)?.[1];
  if (!routeJson || !harness) throw new Error("Prototype harness missing");

  const posted: unknown[] = [];
  runInNewContext(harness, {
    document: {
      body,
      getElementById: () => ({ textContent: routeJson }),
      querySelectorAll: () => screens,
      addEventListener: (
        type: string,
        listener: typeof click,
      ) => {
        if (type === "click") click = listener;
      },
    },
    window: { addEventListener: () => {} },
    parent: { postMessage: (message: unknown) => posted.push(message) },
  });
  click?.({ target: action, preventDefault() {} });

  return { bodyAttributes, screens, posted };
}

describe("buildPrototypeDocument", () => {
  it("is deterministic for identical input", () => {
    expect(buildPrototypeDocument(input())).toBe(buildPrototypeDocument(input()));
  });

  it("embeds the locked-down CSP", () => {
    expect(buildPrototypeDocument(input())).toContain(PROTOTYPE_CSP);
    expect(PROTOTYPE_CSP).toContain("default-src 'none'");
    expect(PROTOTYPE_CSP).toContain("connect-src 'none'");
    expect(PROTOTYPE_CSP).toContain("form-action 'none'");
    expect(PROTOTYPE_CSP).toContain("base-uri 'none'");
  });

  it("blocks inline event handlers at the CSP layer", () => {
    expect(PROTOTYPE_CSP).toContain("script-src-attr 'none'");
  });

  it("shows only the start screen", () => {
    const html = buildPrototypeDocument(input());
    expect(html).toContain(`<section data-meld-screen="${SIGN_UP}" aria-label="Sign up">`);
    expect(html).toContain(`<section data-meld-screen="${DASHBOARD}" aria-label="Dashboard" hidden>`);
  });

  it("scopes each screen's styles to its own section", () => {
    const html = buildPrototypeDocument(input());
    expect(html).toContain(`[data-meld-screen="${SIGN_UP}"] { button { padding: 8px; } }`);
    expect(html).toContain(`[data-meld-screen="${DASHBOARD}"] { h1 { font-size: 24px; } }`);
  });

  it("hoists @keyframes out of the scoping block, where it would be invalid", () => {
    const document = input();
    document.screens[0].styles = "@keyframes pulse { from { opacity: 0; } } p { opacity: 1; }";
    const html = buildPrototypeDocument(document);
    expect(html).toContain("@keyframes pulse { from { opacity: 0; } }");
    expect(html).not.toContain(`[data-meld-screen="${SIGN_UP}"] { @keyframes`);
    expect(html).toContain(`[data-meld-screen="${SIGN_UP}"] { p { opacity: 1; } }`);
  });

  it("maps actions to target screens by id, never by name", () => {
    const html = buildPrototypeDocument(input());
    expect(html).toContain(`"${SIGN_UP}":{"go":"${DASHBOARD}"}`);
    expect(html).not.toContain('"Continue":');
  });

  it("routes per screen so two screens can reuse an action id", () => {
    const A = "11111111-1111-4111-8111-111111111111";
    const B = "22222222-2222-4222-8222-222222222222";
    const html = buildPrototypeDocument({
      startScreenId: A,
      tokenCss: "",
      screens: [
        {
          id: A,
          name: "A",
          markup: '<button data-meld-action="go">Go</button>',
          styles: "",
          script: null,
          actions: [{ id: "go", label: "Go", targetScreenId: B }],
        },
        {
          id: B,
          name: "B",
          markup: '<button data-meld-action="go">Go</button>',
          styles: "",
          script: null,
          actions: [{ id: "go", label: "Go", targetScreenId: A }],
        },
      ],
    });

    expect(html).toContain(`"${A}":{"go":"${B}"}`);
    expect(html).toContain(`"${B}":{"go":"${A}"}`);
  });

  it("emits a null target rather than dropping the action", () => {
    const document = input();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document.screens[0].actions[0] as any).targetScreenId = null;
    expect(buildPrototypeDocument(document)).toContain('"go":null');
  });

  it("keeps the current screen visible when an action target is missing", () => {
    const document = input();
    document.screens[0].actions[0].targetScreenId =
      "33333333-3333-4333-8333-333333333333";

    const state = runHarnessClick(buildPrototypeDocument(document), "go");

    expect(state.screens[0].hidden).toBe(false);
    expect(state.screens[1].hidden).toBe(true);
    expect(state.bodyAttributes.get("data-meld-current")).toBe(SIGN_UP);
    expect(state.bodyAttributes.get("data-meld-unresolved")).toBe("go");
    expect(state.posted).toContainEqual({
      type: "meld:action-unresolved",
      action: "go",
      label: "Continue",
    });
  });

  it("tells the host when a click resolves to nothing", () => {
    // Silence here is what made a missing link look like broken software:
    // data-meld-unresolved was set on the body and read by nobody.
    const doc = buildPrototypeDocument(input());
    expect(doc).toContain('"meld:action-unresolved"');
  });

  it("collapses whitespace in the reported label", () => {
    // Regression guard: inside the HARNESS template literal, an unescaped
    // `\s` collapses to a literal `s` (JS drops unrecognized string
    // escapes), silently turning the whitespace regex into one that strips
    // the letter "s" instead. This only fails if a label actually contains
    // whitespace to collapse -- a single-word label would pass either way.
    const document = input();
    document.screens[0].actions[0].targetScreenId =
      "33333333-3333-4333-8333-333333333333";
    const state = runHarnessClick(
      buildPrototypeDocument(document),
      "go",
      "  Continue   to\n\tcheckout  \n",
    );
    expect(state.posted).toContainEqual({
      type: "meld:action-unresolved",
      action: "go",
      label: "Continue to checkout",
    });
  });

  it("caps the reported label at 60 characters", () => {
    const document = input();
    document.screens[0].actions[0].targetScreenId =
      "33333333-3333-4333-8333-333333333333";
    const longLabel = "A".repeat(90);
    const state = runHarnessClick(
      buildPrototypeDocument(document),
      "go",
      longLabel,
    );
    expect(state.posted).toContainEqual({
      type: "meld:action-unresolved",
      action: "go",
      label: "A".repeat(60),
    });
  });

  it("escapes a route target that tries to close the json block", () => {
    // action ids and uuids can't contain `<` in real data, so this drives the
    // `<`→`\u003c` escaping through the route map deliberately.
    const document = input();
    document.screens[0].actions[0].targetScreenId = "</script><script>alert(1)</script>";
    const html = buildPrototypeDocument(document);
    expect(html).not.toContain("<script>alert(1)");
    expect(html).toContain("\\u003c/script");
  });

  it("throws when the start screen is not in the set", () => {
    const document = input();
    document.startScreenId = "33333333-3333-4333-8333-333333333333";
    expect(() => buildPrototypeDocument(document)).toThrow("Unknown start screen");
  });

  it("never injects or executes generated screen scripts", () => {
    const document = input();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document.screens[0] as any).script =
      'window["loc" + "ation"] = "https://evil.test"';
    const html = buildPrototypeDocument(document);

    expect(html).not.toContain('window["loc" + "ation"]');
    expect(html.match(/<script(?:\s|>)/g)).toHaveLength(2);
  });

  it("neutralizes </style in screen styles to prevent breakout", () => {
    const document = input();
    document.screens[0].styles = 'a { content: "</style>"; }';
    const html = buildPrototypeDocument(document);
    expect(html).not.toContain('"</style>"');
    expect(html).toContain("<\\/style");
  });

  it("ignores @keyframes mentions in CSS comments", () => {
    const document = input();
    document.screens[0].styles = "/* @keyframes note */ button { color: red; }";
    const html = buildPrototypeDocument(document);
    expect(html).toContain(`[data-meld-screen="${SIGN_UP}"] { button { color: red; } }`);
    expect(html).not.toContain("@keyframes");
    expect(html).not.toContain("note */");
  });

  it("regression: a layout: null screen renders byte-identical to the pre-layout snapshot", () => {
    const document = input();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document.screens[0] as any).layout = null;
    const html = buildPrototypeDocument(document);
    expect(html).toBe(buildPrototypeDocument(input()));
    // The harness script's `next.hasAttribute("data-meld-layout")` gate means
    // that substring now always appears in the embedded <script>, so assert
    // on the <section> markup specifically rather than the whole document.
    expect(html).not.toMatch(/<section[^>]*data-meld-layout/);
  });

  it("wraps a screen's content in its layout shell, namespaces the nav action, and emits the shell styles once", () => {
    const document = input();
    (document.screens[0] as { layout?: unknown }).layout = {
      id: "L1",
      shellStyles: "aside { color: red; }",
      shellMarkup:
        '<aside><a data-meld-action="nav-home">Home</a></aside><main data-meld-slot></main>',
      actions: [
        { id: "nav-home", label: "Home", targetScreenId: SIGN_UP, targetScreenKey: null },
      ],
    };
    const html = buildPrototypeDocument(document);

    expect(html).toContain(`data-meld-layout="L1"`);
    expect(html).toContain('<main data-meld-slot><button data-meld-action="go">Continue</button></main>');
    expect(html).toContain('data-meld-action="layout__nav-home"');
    expect((html.match(/\[data-meld-layout="L1"\]/g) ?? []).length).toBe(1);
    expect(html).toContain(`"${SIGN_UP}":{"go":"${DASHBOARD}","layout__nav-home":"${SIGN_UP}"}`);
  });

  it("does not leak data-meld-layout when the shell has no slot to inject into", () => {
    const document = input();
    (document.screens[0] as { layout?: unknown }).layout = {
      id: "L1",
      shellStyles: "aside { color: red; }",
      // No data-meld-slot element -- injection must fail and fall back to
      // content-only, so the section must not claim a layout it never applied.
      shellMarkup: "<aside>no slot here</aside>",
      actions: [],
    };
    const html = buildPrototypeDocument(document);

    // See the byte-identical regression test above for why this checks the
    // <section> markup rather than the whole document.
    expect(html).not.toMatch(/<section[^>]*data-meld-layout/);
    expect(html).toContain(`<section data-meld-screen="${SIGN_UP}" aria-label="Sign up">`);
    expect(html).toContain('<button data-meld-action="go">Continue</button>');
  });

  it("dedupes a layout shared by two screens to exactly one style block", () => {
    const document = input();
    const layout = {
      id: "SHARED",
      shellStyles: "aside { color: blue; }",
      shellMarkup:
        '<aside><a data-meld-action="nav-home">Home</a></aside><main data-meld-slot></main>',
      actions: [
        { id: "nav-home", label: "Home", targetScreenId: SIGN_UP, targetScreenKey: null },
      ],
    };
    (document.screens[0] as { layout?: unknown }).layout = layout;
    (document.screens[1] as { layout?: unknown }).layout = layout;
    const html = buildPrototypeDocument(document);

    expect((html.match(/\[data-meld-layout="SHARED"\]/g) ?? []).length).toBe(1);
  });

  it("injects componentCss after tokenCss and before per-screen scoped styles", () => {
    const document = { ...input(), componentCss: ".ds-button{font-weight:600}" };
    const html = buildPrototypeDocument(document);

    expect(html).toContain(".ds-button{font-weight:600}");

    const tokenIndex = html.indexOf(document.tokenCss);
    const componentIndex = html.indexOf(".ds-button{font-weight:600}");
    const scopedIndex = html.indexOf(`[data-meld-screen="${SIGN_UP}"] {`);

    expect(tokenIndex).toBeGreaterThanOrEqual(0);
    expect(componentIndex).toBeGreaterThan(tokenIndex);
    expect(scopedIndex).toBeGreaterThan(componentIndex);
  });

  it("omits componentCss entirely when not provided, with no stray empty <style></style>", () => {
    const html = buildPrototypeDocument(input());
    expect(html).not.toContain("<style></style>");
  });

  it("no longer injects a screen picker into the document", () => {
    // The picker was app chrome living inside the artifact: unstyleable, sitting
    // over the design, and present in anything exported. capture-screen-thumbnail
    // had to strip it back out again, which is the tell.
    const doc = buildPrototypeDocument(input());
    expect(doc).not.toContain("meld-screen-picker");
    expect(doc).not.toContain("<select");
  });

  it("navigates when the host posts meld:navigate", () => {
    const doc = buildPrototypeDocument(input());
    expect(doc).toContain('"meld:navigate"');
    expect(doc).toContain("addEventListener(\"message\"");
  });

  it("reports every screen change back to the host", () => {
    // Required, not optional: clicking a button INSIDE the prototype navigates
    // too. Without this the pill's label silently drifts out of sync with what
    // is actually on screen.
    const doc = buildPrototypeDocument(input());
    expect(doc).toContain('"meld:screen-changed"');
    expect(doc).toContain("postMessage");
  });
});

describe("photographs the safety layer already allows", () => {
  it("lets the allowlisted image host through the CSP", () => {
    // screen-safety permits <img src="https://images.unsplash.com/...">, but
    // the document's own policy said img-src data: -- so the markup survived
    // review and the browser then refused to load it, rendering a broken-image
    // icon and the alt text. A policy in two places is only as open as its
    // strictest copy.
    expect(PROTOTYPE_CSP).toContain("https://images.unsplash.com");
  });

  it("still refuses images from anywhere else", () => {
    const imgSrc = PROTOTYPE_CSP.split("; ").find((directive) =>
      directive.startsWith("img-src"),
    );
    expect(imgSrc).toBe("img-src data: https://images.unsplash.com");
  });

  it("keeps every other directive shut", () => {
    // Widening img-src must not have loosened the rest.
    expect(PROTOTYPE_CSP).toContain("default-src 'none'");
    expect(PROTOTYPE_CSP).toContain("connect-src 'none'");
    expect(PROTOTYPE_CSP).toContain("font-src data:");
  });
});
