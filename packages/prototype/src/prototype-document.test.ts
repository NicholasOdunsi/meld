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
    expect(html).toContain(`"go":"${DASHBOARD}"`);
    expect(html).not.toContain('"Continue":');
  });

  it("emits a null target rather than dropping the action", () => {
    const document = input();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document.screens[0].actions[0] as any).targetScreenId = null;
    expect(buildPrototypeDocument(document)).toContain('"go":null');
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

  it("wraps each screen's script so one screen's error cannot stop another", () => {
    const document = input();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (document.screens[0] as any).script = "throw new Error('boom')";
    expect(buildPrototypeDocument(document)).toContain("try {");
  });
});
