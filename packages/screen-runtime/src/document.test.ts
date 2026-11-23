import { createContext, runInContext, runInNewContext } from "node:vm";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { describe, expect, it, vi } from "vitest";
import type { CompiledScreen } from "./compile";
import { assembleScreenDocument, inlineScript, SCREEN_DOCUMENT_DEFAULTS, SCREEN_SCROLLBAR_DEFAULTS } from "./document";
import { FRAME_BRIDGE_SOURCE } from "./runtime/bridge";
import { MODULE_LOADER_SOURCE } from "./runtime/loader";

const screen: CompiledScreen = {
  kind: "html", html: '<main id="screen">Hello</main>', scripts: ['window.screenRan = true;'],
  styles: ['main { color: red; }', 'body { background: white; }'], links: [],
};
const env = { csp: "default-src 'none'; script-src 'unsafe-inline'", runtimeBundle: "window.runtimeLoaded = true;" };

function elements(source: string, tag: string) {
  const found: DefaultTreeAdapterMap["element"][] = [];
  function visit(node: DefaultTreeAdapterMap["node"]) {
    if ("tagName" in node && node.tagName === tag) found.push(node);
    if ("childNodes" in node) node.childNodes.forEach(visit);
  }
  visit(parse(source));
  return found;
}
function text(node: DefaultTreeAdapterMap["element"]) {
  return node.childNodes.map((child) => "value" in child ? child.value : "").join("");
}

describe("inlineScript", () => {
  it("escapes closing script prefixes case-insensitively, including repeated occurrences", () => {
    expect(inlineScript('</script> </ScRiPt > </SCRIPTING>')).toBe('<\\/script> <\\/script > <\\/scriptING>');
  });

  it("neutralises HTML comment openers so script data cannot enter the double-escaped state", () => {
    expect(inlineScript('var s = "<!--<script>";')).toBe('var s = "\\x3C!--<script>";');
    const document = `<body><script>${inlineScript('var s = "<!--<script>";')}</script><p id="after">x</p></body>`;
    expect(elements(document, "script")).toHaveLength(1);
    expect(elements(document, "p")).toHaveLength(1);
    expect(runInNewContext(inlineScript('"<!--<script>"'))).toBe("<!--<script>");
  });

  it("leaves other JavaScript unchanged", () => {
    const js = 'const html = "<script>"; const slash = /foo/;';
    expect(inlineScript(js)).toBe(js);
  });
});

describe("assembleScreenDocument", () => {
  it("puts caller CSP first, before charset, viewport, styles and scripts", () => {
    const document = assembleScreenDocument(screen, env);
    expect(document.startsWith('<!doctype html><meta http-equiv="Content-Security-Policy" content="')).toBe(true);
    const meta = elements(document, "meta");
    expect(meta.map((node) => node.attrs)).toEqual([
      [{ name: "http-equiv", value: "Content-Security-Policy" }, { name: "content", value: env.csp }],
      [{ name: "charset", value: "utf-8" }],
      [{ name: "name", value: "viewport" }, { name: "content", value: "width=device-width, initial-scale=1" }],
    ]);
    expect(document.indexOf('<meta name="viewport"')).toBeLessThan(document.indexOf("<style>"));
    expect(document.indexOf("<style>")).toBeLessThan(document.indexOf("<script>"));
  });

  it("orders runtime, bridge and loader before markup, then each screen script, then ready", () => {
    const document = assembleScreenDocument(screen, env);
    const scripts = elements(document, "script").map(text);
    expect(scripts).toHaveLength(5);
    expect(scripts.slice(0, 3)).toEqual([env.runtimeBundle, FRAME_BRIDGE_SOURCE, MODULE_LOADER_SOURCE]);
    expect(document.indexOf(screen.html)).toBeGreaterThan(document.indexOf(inlineScript(MODULE_LOADER_SOURCE)));
    expect(document.indexOf(screen.html)).toBeLessThan(document.indexOf(screen.scripts[0]));
    expect(scripts[3]).toBe(screen.scripts[0]);
    expect(scripts[4]).toBe("window.__orionReady()");
    expect(elements(document, "body")[0].childNodes.map((node) => node.nodeName)).toEqual(["main", "script", "script"]);
  });

  it("resets html/body margin and preserves ordered screen CSS", () => {
    const styles = elements(assembleScreenDocument(screen, env), "style").map(text).join("\n");
    expect(styles).toMatch(/html\s*,\s*body\s*\{\s*margin:\s*0;?\s*\}/);
    expect(styles).toContain(screen.styles[0]);
    expect(styles.indexOf(screen.styles[0])).toBeLessThan(styles.indexOf(screen.styles[1]));
  });

  it("keeps a screen's scrolling inside it, with defaults the screen's own CSS can override", () => {
    const styles = elements(assembleScreenDocument(screen, env), "style").map(text);
    // Reaching the end of the page must not hand the leftover scroll to the board around it.
    expect(SCREEN_DOCUMENT_DEFAULTS.join("\n")).toMatch(/html\s*,\s*body\s*\{[^}]*overscroll-behavior:\s*contain/);
    expect(styles.slice(0, SCREEN_DOCUMENT_DEFAULTS.length)).toEqual([...SCREEN_DOCUMENT_DEFAULTS]);
    // The defaults come before the screen's own styles, so equal-specificity author rules win.
    expect(styles.slice(SCREEN_DOCUMENT_DEFAULTS.length)).toEqual(screen.styles);
  });

  it("quiets the scrollbar: a transparent track and a thin translucent thumb, before the screen's own styles", () => {
    const css = SCREEN_SCROLLBAR_DEFAULTS.join("\n");
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*width:\s*8px/);
    expect(css).toMatch(/::-webkit-scrollbar\s*\{[^}]*height:\s*8px/);
    expect(css).toMatch(/::-webkit-scrollbar-track\s*[,{][^}]*background:\s*transparent/);
    expect(css).toMatch(/::-webkit-scrollbar-corner\s*[,{][^}]*background:\s*transparent/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb\s*\{[^}]*background-color:\s*rgba\(128,\s*128,\s*128,\s*0?\.45\)/);
    expect(css).toMatch(/::-webkit-scrollbar-thumb:hover\s*\{[^}]*rgba\(128,\s*128,\s*128,\s*0?\.7\)/);
    // Chromium ignores every ::-webkit-scrollbar rule on an element that sets scrollbar-color or
    // scrollbar-width, so the defaults must not set them (a screen that does still wins).
    expect(css).not.toMatch(/scrollbar-(color|width)/);
    // All of it is in the shared defaults, and so ahead of the screen's own styles.
    for (const rule of SCREEN_SCROLLBAR_DEFAULTS) expect(SCREEN_DOCUMENT_DEFAULTS).toContain(rule);
    const document = assembleScreenDocument({ ...screen, styles: ["::-webkit-scrollbar{width:2px}"] }, env);
    expect(document.indexOf("::-webkit-scrollbar-track")).toBeGreaterThan(-1);
    expect(document.indexOf("::-webkit-scrollbar-track")).toBeLessThan(document.indexOf("::-webkit-scrollbar{width:2px}"));
  });

  it("escapes mixed-case script terminators in runtime and compiled JavaScript", () => {
    const runtimeBundle = 'window.payload = "</ScRiPt><script>runtimeAttack()</script>";';
    const script = 'window.payload = "</SCRIPT><script>screenAttack()</script>";';
    const document = assembleScreenDocument({ ...screen, scripts: [script] }, { ...env, runtimeBundle });
    const scripts = elements(document, "script").map(text);
    expect(scripts).toHaveLength(5);
    expect(scripts[0]).toBe(inlineScript(runtimeBundle));
    expect(scripts[3]).toBe(inlineScript(script));
    expect(elements(document, "main")).toHaveLength(1);
  });

  it("escapes style terminators so CSS cannot inject executable markup", () => {
    const css = 'main::after { content: "</StYlE><script>attack()</script>"; }';
    const document = assembleScreenDocument({ ...screen, styles: [css] }, env);
    expect(elements(document, "script")).toHaveLength(5);
    expect(elements(document, "style").map(text).join("\n")).toContain('<\\/style><script>attack()</script>');
  });

  it("escapes ampersands and double quotes in the CSP attribute without changing its value", () => {
    const csp = 'default-src \'none\'; report-uri https://example.test/?q="quoted"&next=&quot;';
    const document = assembleScreenDocument(screen, { ...env, csp });
    expect(document).toContain('q=&quot;quoted&quot;&amp;next=&amp;quot;');
    expect(elements(document, "meta")[0].attrs.find((attr) => attr.name === "content")?.value).toBe(csp);
  });

  const runScripts = (compiled: CompiledScreen, window: Record<string, unknown>) => {
    const context = createContext({ window });
    for (const script of elements(assembleScreenDocument(compiled, env), "script").map(text).slice(3)) {
      runInContext(script, context);
    }
    return context;
  };

  it("calls ready after successful screen execution", () => {
    const ready = vi.fn();
    const window = { __orionReady: ready, __orionReport: vi.fn(), screenRan: false };
    runScripts(screen, window);
    expect(window.screenRan).toBe(true);
    expect(ready).toHaveBeenCalledOnce();
    expect(window.__orionReport).not.toHaveBeenCalled();
  });

  it("shares top-level const, let and class declarations across HTML scripts", () => {
    const window = { __orionReady: vi.fn(), __orionReport: vi.fn(), result: null as unknown };
    runScripts({ ...screen, scripts: [
      "const toggle = () => 'toggled'; let state = { n: 1 }; class Box { v() { return 2; } }",
      "window.result = [toggle(), state.n, new Box().v()];",
    ] }, window);
    expect(window.result).toEqual(["toggled", 1, 2]);
  });

  it("lets later HTML scripts and ready run after an earlier script throws", () => {
    const window = { __orionReady: vi.fn(), __orionReport: vi.fn(), later: false };
    const context = createContext({ window });
    const [, , , ...rest] = elements(assembleScreenDocument(
      { ...screen, scripts: ['throw new Error("first failed");', "window.later = true;"] }, env,
    ), "script").map(text);
    const errors: unknown[] = [];
    for (const script of rest) {
      try { runInContext(script, context); } catch (error) { errors.push(error); }
    }
    expect(errors).toHaveLength(1);
    expect(window.later).toBe(true);
    expect(window.__orionReady).toHaveBeenCalledOnce();
  });

  it("reports React execution errors through the outer catch without announcing ready", () => {
    const window = { __orionReady: vi.fn(), __orionReport: vi.fn() };
    const react: CompiledScreen = { ...screen, kind: "react", scripts: ['throw new Error("screen failed");'] };
    const script = elements(assembleScreenDocument(react, env), "script").map(text).at(-1)!;
    expect(() => runInNewContext(script, { window })).not.toThrow();
    expect(window.__orionReady).not.toHaveBeenCalled();
    expect(window.__orionReport).toHaveBeenCalledOnce();
    expect(window.__orionReport.mock.calls[0][0].message).toBe("screen failed");
  });
});
