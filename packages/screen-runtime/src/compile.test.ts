import { createContext, runInContext } from "node:vm";
import { describe, expect, it, vi } from "vitest";
import { compileScreen, type CompiledScreen } from "./compile";
import { TAG_ATTRIBUTE, STUCK_MESSAGE } from "./constants";
import { parseTag } from "./tag-elements";
import { MODULE_LOADER_SOURCE } from "./runtime/loader";
import type { ScreenSource } from "./source";

function compile(files: Record<string, string>, options: Parameters<typeof compileScreen>[1] = { tagElements: true }, kind: ScreenSource["kind"] = "react", entry = kind === "react" ? "App.tsx" : "index.html") {
  return compileScreen({ kind, files, entry }, options);
}
function screen(result: ReturnType<typeof compileScreen>): CompiledScreen {
  expect(result.ok).toBe(true);
  if (!result.ok) throw new Error(JSON.stringify(result.errors));
  return result.screen;
}

describe("compileScreen React", () => {
  it("rejects embedded frames in JSX", () => {
    const result = compile({ "App.tsx": 'export default function App() { return <iframe srcDoc="<p>x</p>" />; }' });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors).toContainEqual({ file: "App.tsx", message: "Embedded frames are not supported: <iframe>" });
  });

  it("rejects relative imports of non-code files and ignores type-only package imports", () => {
    const result = compile({
      "App.tsx": 'import data from "./data.json"; import type { Metadata } from "next"; export default function App(){ return <p>{String(data)}</p>; }',
      "data.json": "{}",
    });
    expect(result).toEqual({ ok: false, errors: [
      { file: "App.tsx", message: "Unsupported file type: ./data.json (only .tsx, .ts, .jsx, .js and .css files can be imported)" },
    ] });
  });

  it("registers dependencies and CSS and mounts through the real loader with the automatic JSX runtime", () => {
    const compiled = screen(compile({
      "App.tsx": 'import { label } from "./label"; import "./style.css"; export default function App(){ return <h1>{label}</h1>; }',
      "label.ts": 'export const label: string = "Hello";',
      "style.css": "h1 { color: red; }",
    }));
    expect(compiled.kind).toBe("react");
    expect(compiled.html).toBe('<div id="orion-root"></div>');
    expect(compiled.styles).toEqual(["h1 { color: red; }"]);
    expect(compiled.scripts.join("\n")).toContain('__orionDefine("label.ts"');
    expect(compiled.scripts.join("\n")).toContain('__orionMount("App.tsx")');
    const render = vi.fn();
    const jsx = (type: string, props: unknown) => ({ type, props });
    const window = { __orionModules: {
      react: { createElement: (component: () => unknown) => component() },
      "react-dom/client": { createRoot: () => ({ render }) },
      "react/jsx-runtime": { jsx, jsxs: jsx },
    } };
    new Function("window", "document", `${MODULE_LOADER_SOURCE}\nconst { __orionDefine, __orionMount } = window;\n${compiled.scripts.join("\n")}`)(window, { getElementById: () => ({}) });
    expect(render).toHaveBeenCalledWith({ type: "h1", props: expect.objectContaining({ children: "Hello" }) });
  });

  it("tags host JSX with original offsets only when requested", () => {
    const source = 'export default () => <h1>Hello</h1>;';
    const tagged = screen(compile({ "App.tsx": source }));
    expect(tagged.scripts.join("\n")).toContain(`${TAG_ATTRIBUTE}": "App.tsx:${source.indexOf("<h1>")}:${source.indexOf(";")}`);
    expect(screen(compile({ "App.tsx": source }, { tagElements: false })).scripts.join("\n")).not.toContain(TAG_ATTRIBUTE);
  });

  it("reports deterministic per-file unsupported, missing, and dynamic imports", () => {
    expect(compile({
      "z.js": 'import "z-package"; import "a-package";',
      "App.tsx": 'import "./missing"; import("react");',
    })).toEqual({ ok: false, errors: [
      { file: "App.tsx", message: "File not found: ./missing" },
      { file: "App.tsx", message: "Dynamic import() is not supported" },
      { file: "z.js", message: "Unsupported package: a-package" },
      { file: "z.js", message: "Unsupported package: z-package" },
    ] });
  });

  it("identifies the syntax error file with a single-line diagnostic", () => {
    const result = compile({ "App.tsx": "export default () => <h1/>;", "broken.ts": "const = ;" });
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.errors).toHaveLength(1);
    expect(result.errors[0].file).toBe("broken.ts");
    expect(result.errors[0].message).toMatch(/Unexpected token/);
    expect(result.errors[0].message).not.toContain("\n");
  });

  it("extracts links from every source file", () => {
    expect(screen(compile({ "App.tsx": 'export default () => <a data-goto="next"/>;', "extra.js": 'orion.goto("other")' })).links).toEqual(["next", "other"]);
  });

  it.each(["missing.tsx", "style.css"])("rejects an unmountable entry %s", (entry) => {
    const result = compile({ "App.tsx": "export default () => null;", "style.css": "" }, { tagElements: false }, "react", entry);
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].file).toBe(entry);
  });

  it("deduplicates CSS shared by modules and transforms all supported script extensions", () => {
    const compiled = screen(compile({
      "App.tsx": 'import "./shared.css"; export { default } from "./Page.jsx";',
      "Page.jsx": 'import "./shared.css"; export default () => <p/>;',
      "helper.ts": 'export const value: number = 1;',
      "other.js": 'export const value = 2;',
      "shared.css": "p{}",
    }));
    expect(compiled.styles).toEqual(["p{}"]);
    for (const file of ["App.tsx", "Page.jsx", "helper.ts", "other.js"]) {
      expect(compiled.scripts.join("\n")).toContain(`__orionDefine(${JSON.stringify(file)},`);
    }
  });

  it("guards React module loops before execution", () => {
    const compiled = screen(compile({ "App.tsx": "while(true){}; export default () => null;" }, { tagElements: false, loopBudgetMs: 0 }));
    let tick = 0;
    const define = (_file: string, factory: (require: unknown, module: object, exports: object) => void) => factory(undefined, {}, {});
    expect(() => new Function("Date", "__orionDefine", "__orionMount", compiled.scripts.join("\n"))({ now: () => tick++ }, define, () => {})).toThrow(STUCK_MESSAGE);
  });

  it("ignores inherited script files", () => {
    const files = Object.assign(Object.create({ "bad.js": "const = ;" }), { "App.tsx": "export default () => null;" });
    expect(compile(files).ok).toBe(true);
  });
});

describe("compileScreen HTML", () => {
  it("rejects embedded frames, which would run scripts without the loop guard", () => {
    const result = compile({ "index.html": '<iframe srcdoc="<script>while(true){}</script>"></iframe><object data="data:text/html,x"></object><embed src="x">' }, { tagElements: false }, "html");
    expect(result).toEqual({ ok: false, errors: [
      { file: "index.html", message: "Embedded frames are not supported: <iframe>" },
      { file: "index.html", message: "Embedded frames are not supported: <object>" },
      { file: "index.html", message: "Embedded frames are not supported: <embed>" },
    ] });
  });

  it("runs two classic scripts that each have a top-level loop in one document", () => {
    const compiled = screen(compile({ "index.html": "<script>var n = 0; for (let i = 0; i < 2; i++) n++;</script><script>for (let i = 0; i < 3; i++) n++;</script>" }, { tagElements: false }, "html"));
    const context = createContext({});
    for (const script of compiled.scripts) runInContext(script, context);
    expect(context.n).toBe(5);
  });
  it("extracts head and body styles and guarded scripts, retaining body markup", () => {
    const source = '<html><head><style>h1{color:red}</style></head><body><h1 data-goto="next">Hello</h1><script>while(true){}</script><style>body{margin:0}</style></body></html>';
    const compiled = screen(compile({ "index.html": source }, { tagElements: false, loopBudgetMs: 0 }, "html"));
    expect(compiled.kind).toBe("html");
    expect(compiled.styles).toEqual(["h1{color:red}", "body{margin:0}"]);
    expect(compiled.html).toBe('<h1 data-goto="next">Hello</h1>');
    expect(compiled.links).toEqual(["next"]);
    let tick = 0;
    expect(() => new Function("Date", compiled.scripts.join("\n"))({ now: () => tick++ })).toThrow(STUCK_MESSAGE);
  });

  it("tags literal elements with exact original full ranges and skips synthesized elements", () => {
    const source = '<!doctype html><html><head></head><body><table><tr><td>x</td></tr></table><h1>Hello &amp; bye</h1></body></html>';
    const compiled = screen(compile({ "index.html": source }, { tagElements: true }, "html"));
    const match = /<h1 data-orion-src="([^"]+)">/.exec(compiled.html)!;
    const tag = parseTag(match[1])!;
    expect(source.slice(tag.start, tag.end)).toBe("<h1>Hello &amp; bye</h1>");
    expect(compiled.html).toContain("<tbody>");
    expect(compiled.html).not.toContain("<tbody data-orion-src");
    expect(compiled.html).not.toContain("<body");
  });

  it("rejects external script and stylesheet references in document order", () => {
    expect(compile({ "index.html": '<link rel="alternate STYLESHEET" href="x.css"><script src=""></script>' }, { tagElements: true }, "html")).toEqual({ ok: false, errors: [
      { file: "index.html", message: "External stylesheets are not supported" },
      { file: "index.html", message: "External scripts are not supported" },
    ] });
  });

  it("preserves existing source tags and handles template content", () => {
    const compiled = screen(compile({ "index.html": '<template><strong>inside</strong></template><p data-orion-src="custom">body</p>' }, { tagElements: true }, "html"));
    expect(compiled.html).toContain('<p data-orion-src="custom">body</p>');
    // A template before the body belongs to the head and is omitted with it.
    expect(compiled.html).not.toContain("<template");
    const inBody = screen(compile({ "index.html": '<body><template><strong>inside</strong></template></body>' }, { tagElements: true }, "html"));
    expect(inBody.html).toContain('<strong data-orion-src="index.html:16:39">inside</strong>');
  });

  it("retains inert data scripts without parsing or executing their content", () => {
    const compiled = screen(compile({ "index.html": '<body><script type="application/json" id="state">{"count":1}</script><script type="importmap">{"imports":{}}</script></body>' }, { tagElements: false }, "html"));
    expect(compiled.scripts).toEqual([]);
    expect(compiled.html).toContain('<script type="application/json" id="state">{"count":1}</script>');
    expect(compiled.html).toContain('<script type="importmap">{"imports":{}}</script>');
  });

  it("preserves head data scripts in the output markup", () => {
    const compiled = screen(compile({ "index.html": '<html><head><script type="application/json" id="state">{"count":1}</script></head><body><p>Hello</p></body></html>' }, { tagElements: false }, "html"));
    expect(compiled.html).toBe('<script type="application/json" id="state">{"count":1}</script><p>Hello</p>');
    expect(compiled.scripts).toEqual([]);
  });

  it("rejects module scripts explicitly", () => {
    expect(compile({ "index.html": '<script type="module">export {}</script>' }, { tagElements: false }, "html")).toEqual({ ok: false, errors: [
      { file: "index.html", message: "Module scripts are not supported" },
    ] });
  });

  it.each(["text/javascript", "TEXT/JAVASCRIPT", "text/javascript; charset=utf-8"])("recognizes explicit classic script MIME type %s", (type) => {
    const compiled = screen(compile({ "index.html": `<script type="${type}">while(true){}</script>` }, { tagElements: false }, "html"));
    expect(compiled.html).toBe("");
    expect(compiled.scripts.join("\n")).toContain(STUCK_MESSAGE);
  });

  it("reports inline syntax errors without throwing", () => {
    const result = compile({ "index.html": "<script>const = ;</script>" }, { tagElements: false }, "html");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0]).toMatchObject({ file: "index.html", message: expect.stringContaining("Unexpected token") });
  });

  it("does not eagerly execute inert template scripts or extract template styles", () => {
    const scriptTemplate = screen(compile({ "index.html": '<body><template><script>while(true){}</script></template></body>' }, { tagElements: false }, "html"));
    expect(scriptTemplate.scripts).toEqual([]);
    expect(scriptTemplate.html).toContain("<template><script>");
    expect(scriptTemplate.html).toContain(STUCK_MESSAGE);
    const compiled = screen(compile({ "index.html": '<body><template><style>p{color:red}</style><p>inert</p></template></body>' }, { tagElements: false }, "html"));
    expect(compiled.styles).toEqual([]);
    expect(compiled.html).toContain('<template><style>p{color:red}</style><p>inert</p></template>');
  });

  it("emits each classic script separately so each keeps its own guard", () => {
    const compiled = screen(compile({ "index.html": '<script>globalThis.first = function () {}</script><script>while(true){}</script>' }, { tagElements: false }, "html"));
    expect(compiled.scripts).toHaveLength(2);
    expect(compiled.scripts[0]).toContain("globalThis.first");
    expect(compiled.scripts[1]).toContain(STUCK_MESSAGE);
    expect(compiled.scripts[0]).not.toContain(STUCK_MESSAGE);
  });

  it("guards inline event handlers and preserves return statements and original offsets", () => {
    const source = '<button onclick="while(true){}; return false">click</button>';
    const compiled = screen(compile({ "index.html": source }, { tagElements: true, loopBudgetMs: 0 }, "html"));
    expect(compiled.html).toContain(`data-orion-src="index.html:0:${source.length}"`);
    const handler = /onclick="([^"]*)"/.exec(compiled.html)![1].replaceAll("&quot;", '"');
    let tick = 0;
    expect(() => new Function("Date", handler)({ now: () => tick++ })).toThrow(STUCK_MESSAGE);
    const returning = screen(compile({ "index.html": '<button onclick="return false">x</button>' }, { tagElements: false }, "html"));
    expect(returning.html).toContain('onclick="return false;"');
  });

  it.each(['javascript:while(true){}', '  JaVaScRiPt:alert(1)', 'java\tscript:alert(1)', 'java\nscript:alert(1)', 'java&#x73;cript:alert(1)'])("rejects executable URL attributes: %s", (url) => {
    expect(compile({ "index.html": `<a href="${url}">x</a>` }, { tagElements: false }, "html")).toEqual({ ok: false, errors: [
      { file: "index.html", message: "javascript: URLs are not supported" },
    ] });
  });

  it("rejects namespaced executable SVG URLs", () => {
    expect(compile({ "index.html": '<svg><a xlink:href="javascript:alert(1)">x</a></svg>' }, { tagElements: false }, "html")).toEqual({ ok: false, errors: [
      { file: "index.html", message: "javascript: URLs are not supported" },
    ] });
  });

  it("reports invalid inline event syntax", () => {
    const result = compile({ "index.html": '<img onerror="const = ;">' }, { tagElements: false }, "html");
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.errors[0].file).toBe("index.html");
  });

  it("separates inline script bodies and handles a missing HTML entry", () => {
    const compiled = screen(compile({ "index.html": "<script>let a=1 // comment</script><p>x</p><script>a++</script>" }, { tagElements: false }, "html"));
    expect(compiled.scripts).toHaveLength(2);
    compiled.scripts.forEach((script) => expect(() => new Function(script)).not.toThrow());
    expect(compileScreen({ kind: "html", files: {}, entry: "missing.html" }, { tagElements: false }).ok).toBe(false);
  });
});

it("reports authored coordinates for React and inline HTML syntax errors",()=>{
  const react=compileScreen({kind:"react",entry:"App.tsx",files:{"App.tsx":"export default () => (\n  <button>\n);"}},{tagElements:true});
  expect(react.ok).toBe(false);
  if(!react.ok)expect(react.errors[0]).toMatchObject({file:"App.tsx",line:2});
  const html=compileScreen({kind:"html",entry:"index.html",files:{"index.html":"<main>hi</main>\n<script>\nconst = 1\n</script>"}},{tagElements:true});
  expect(html.ok).toBe(false);
  if(!html.ok)expect(html.errors[0]).toMatchObject({file:"index.html",line:3,column:6});
});
