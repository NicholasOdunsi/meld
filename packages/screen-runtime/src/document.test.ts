import { runInNewContext } from "node:vm";
import { parse, type DefaultTreeAdapterMap } from "parse5";
import { describe, expect, it, vi } from "vitest";
import type { CompiledScreen } from "./compile";
import { assembleScreenDocument, inlineScript } from "./document";
import { FRAME_BRIDGE_SOURCE } from "./runtime/bridge";
import { MODULE_LOADER_SOURCE } from "./runtime/loader";

const screen: CompiledScreen = {
  kind: "html", html: '<main id="screen">Hello</main>', script: 'window.screenRan = true;',
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

  it("orders runtime, bridge and loader before markup and the compiled script", () => {
    const document = assembleScreenDocument(screen, env);
    const scripts = elements(document, "script").map(text);
    expect(scripts).toHaveLength(4);
    expect(scripts.slice(0, 3)).toEqual([env.runtimeBundle, FRAME_BRIDGE_SOURCE, MODULE_LOADER_SOURCE]);
    expect(document.indexOf(screen.html)).toBeGreaterThan(document.indexOf(inlineScript(MODULE_LOADER_SOURCE)));
    expect(document.indexOf(screen.html)).toBeLessThan(document.indexOf(screen.script));
    expect(scripts[3]).toContain(screen.script);
    expect(scripts[3].indexOf(screen.script)).toBeLessThan(scripts[3].indexOf("window.__orionReady()"));
    expect(elements(document, "body")[0].childNodes.map((node) => node.nodeName)).toEqual(["main", "script"]);
  });

  it("resets html/body margin and preserves ordered screen CSS", () => {
    const styles = elements(assembleScreenDocument(screen, env), "style").map(text).join("\n");
    expect(styles).toMatch(/html\s*,\s*body\s*\{\s*margin:\s*0;?\s*\}/);
    expect(styles).toContain(screen.styles[0]);
    expect(styles.indexOf(screen.styles[0])).toBeLessThan(styles.indexOf(screen.styles[1]));
  });

  it("escapes mixed-case script terminators in runtime and compiled JavaScript", () => {
    const runtimeBundle = 'window.payload = "</ScRiPt><script>runtimeAttack()</script>";';
    const script = 'window.payload = "</SCRIPT><script>screenAttack()</script>";';
    const document = assembleScreenDocument({ ...screen, script }, { ...env, runtimeBundle });
    const scripts = elements(document, "script").map(text);
    expect(scripts).toHaveLength(4);
    expect(scripts[0]).toBe(inlineScript(runtimeBundle));
    expect(scripts[3]).toContain(inlineScript(script));
    expect(elements(document, "main")).toHaveLength(1);
  });

  it("escapes style terminators so CSS cannot inject executable markup", () => {
    const css = 'main::after { content: "</StYlE><script>attack()</script>"; }';
    const document = assembleScreenDocument({ ...screen, styles: [css] }, env);
    expect(elements(document, "script")).toHaveLength(4);
    expect(elements(document, "style").map(text).join("\n")).toContain('<\\/style><script>attack()</script>');
  });

  it("escapes ampersands and double quotes in the CSP attribute without changing its value", () => {
    const csp = 'default-src \'none\'; report-uri https://example.test/?q="quoted"&next=&quot;';
    const document = assembleScreenDocument(screen, { ...env, csp });
    expect(document).toContain('q=&quot;quoted&quot;&amp;next=&amp;quot;');
    expect(elements(document, "meta")[0].attrs.find((attr) => attr.name === "content")?.value).toBe(csp);
  });

  it("calls ready after successful screen execution", () => {
    const ready = vi.fn();
    const window = { __orionReady: ready, __orionReport: vi.fn(), screenRan: false };
    const script = elements(assembleScreenDocument(screen, env), "script").map(text).at(-1)!;
    runInNewContext(script, { window });
    expect(window.screenRan).toBe(true);
    expect(ready).toHaveBeenCalledOnce();
    expect(window.__orionReport).not.toHaveBeenCalled();
  });

  it("reports screen execution errors through the outer catch without announcing ready", () => {
    const window = { __orionReady: vi.fn(), __orionReport: vi.fn() };
    const script = elements(assembleScreenDocument({ ...screen, script: 'throw new Error("screen failed");' }, env), "script")
      .map(text).at(-1)!;
    expect(() => runInNewContext(script, { window })).not.toThrow();
    expect(window.__orionReady).not.toHaveBeenCalled();
    expect(window.__orionReport).toHaveBeenCalledOnce();
    expect(window.__orionReport.mock.calls[0][0].message).toBe("screen failed");
  });
});
