import { transform } from "@babel/standalone";
import { parse, serializeOuter, type DefaultTreeAdapterMap } from "parse5";
import { TAG_ATTRIBUTE } from "./constants";
import { extractLinks } from "./links";
import { loopGuardPlugin } from "./loop-guard";
import { moduleGraphPlugin, type ModuleReport } from "./module-graph";
import type { ScreenKind, ScreenSource } from "./source";
import { tagElementsPlugin } from "./tag-elements";

export type CompileError = { file: string; message: string };
export type CompiledScreen = {
  kind: ScreenKind;
  styles: string[];
  script: string;
  html: string;
  links: string[];
};
export type CompileResult = { ok: true; screen: CompiledScreen } | { ok: false; errors: CompileError[] };
type CompileOptions = { tagElements: boolean; loopBudgetMs?: number };

function syntaxError(file: string, error: unknown): CompileError {
  return { file, message: (error instanceof Error ? error.message : String(error)).split("\n")[0] };
}

function compileReact(source: ScreenSource, options: CompileOptions): CompileResult {
  const errors: CompileError[] = [];
  const modules: string[] = [];
  const styles = new Set<string>();
  if (!/\.(tsx?|jsx?)$/.test(source.entry)) {
    return { ok: false, errors: [{ file: source.entry, message: "React entry must be a JavaScript or TypeScript file" }] };
  }
  for (const file of Object.keys(source.files).sort()) {
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    const report: ModuleReport = {
      unsupported: new Set(), missing: new Set(), styles: new Set(), dynamicImport: false,
    };
    try {
      const transformed = transform(source.files[file], {
        filename: file,
        sourceType: "module",
        plugins: [
          loopGuardPlugin({ budgetMs: options.loopBudgetMs }),
          ...(options.tagElements ? [tagElementsPlugin(file)] : []),
          moduleGraphPlugin(file, source.files, report),
        ],
        presets: [["react", { runtime: "automatic" }], ["typescript", { isTSX: true, allExtensions: true }]],
      }).code ?? "";
      // The automatic JSX runtime adds imports during preset processing. Convert
      // modules in a separate pass so those generated imports are lowered too.
      const code = transform(transformed, {
        filename: file,
        sourceType: "module",
        plugins: ["transform-modules-commonjs"],
      }).code ?? "";
      modules.push(`__orionDefine(${JSON.stringify(file)}, function(require, module, exports) {\n${code}\n});`);
    } catch (error) {
      errors.push(syntaxError(file, error));
    }
    for (const name of [...report.unsupported].sort()) errors.push({ file, message: `Unsupported package: ${name}` });
    for (const name of [...report.missing].sort()) errors.push({ file, message: `File not found: ${name}` });
    if (report.dynamicImport) errors.push({ file, message: "Dynamic import() is not supported" });
    for (const style of report.styles) styles.add(style);
  }
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    screen: {
      kind: "react",
      styles: [...styles].map((file) => source.files[file]),
      script: [...modules, `__orionMount(${JSON.stringify(source.entry)});`].join("\n"),
      html: '<div id="orion-root"></div>',
      links: extractLinks(source.files),
    },
  };
}

const CLASSIC_SCRIPT_TYPES = new Set([
  "", "application/ecmascript", "application/javascript", "application/x-ecmascript", "application/x-javascript",
  "text/ecmascript", "text/javascript", "text/javascript1.0", "text/javascript1.1", "text/javascript1.2",
  "text/javascript1.3", "text/javascript1.4", "text/javascript1.5", "text/jscript", "text/livescript",
  "text/x-ecmascript", "text/x-javascript",
]);

type HtmlNode = DefaultTreeAdapterMap["node"];
function compileHtml(source: ScreenSource, options: CompileOptions): CompileResult {
  const document = parse(source.files[source.entry], { sourceCodeLocationInfo: true });
  const errors: CompileError[] = [];
  const styles: string[] = [];
  const scripts: string[] = [];
  const headDataScripts: HtmlNode[] = [];
  let body: DefaultTreeAdapterMap["element"] | undefined;
  function visit(node: HtmlNode, inert = false): boolean {
    if ("tagName" in node) {
      const text = () => node.childNodes.map((child) => "value" in child ? child.value : "").join("");
      if (node.tagName === "body") body = node;
      for (const attr of node.attrs) {
        if (/^on/i.test(attr.name)) {
          try {
            attr.value = transform(attr.value, {
              filename: source.entry,
              sourceType: "script",
              parserOpts: { allowReturnOutsideFunction: true },
              plugins: [loopGuardPlugin({ budgetMs: options.loopBudgetMs })],
            }).code ?? "";
          } catch (error) {
            errors.push(syntaxError(source.entry, error));
          }
        } else if (["href", "src", "action", "formaction", "data", "background", "poster"].includes(attr.name)
          && /^javascript:/i.test(Array.from(attr.value).filter((char) => char.charCodeAt(0) > 32).join(""))) {
          errors.push({ file: source.entry, message: "javascript: URLs are not supported" });
        }
      }
      const location = node.sourceCodeLocation;
      if (options.tagElements && location && !["html", "head", "body"].includes(node.tagName)
        && !node.attrs.some((attr) => attr.name === TAG_ATTRIBUTE)) {
        node.attrs.push({ name: TAG_ATTRIBUTE, value: `${source.entry}:${location.startOffset}:${location.endOffset}` });
      }
      if (node.tagName === "script") {
        if (node.attrs.some((attr) => attr.name === "src")) {
          errors.push({ file: source.entry, message: "External scripts are not supported" });
          return false;
        }
        const type = (node.attrs.find((attr) => attr.name === "type")?.value ?? "").trim().toLowerCase();
        if (type === "module") {
          errors.push({ file: source.entry, message: "Module scripts are not supported" });
          return false;
        }
        // Unknown MIME types contain data rather than executable JavaScript.
        // Keep them in the markup, including JSON and import-map payloads.
        if (!CLASSIC_SCRIPT_TYPES.has(type.split(";")[0].trim())) {
          if (!inert && node.parentNode?.nodeName === "head") headDataScripts.push(node);
          return true;
        }
        try {
          const code = transform(text(), {
            filename: source.entry,
            sourceType: "script",
            plugins: [loopGuardPlugin({ budgetMs: options.loopBudgetMs })],
          }).code ?? "";
          if (inert) {
            node.childNodes = [{ nodeName: "#text", value: code, parentNode: node }];
          } else scripts.push(code);
        } catch (error) {
          errors.push(syntaxError(source.entry, error));
        }
        return inert;
      }
      if (node.tagName === "style") {
        if (inert) return true;
        styles.push(text());
        return false;
      }
      if (node.tagName === "link" && node.attrs.some((attr) => attr.name === "rel"
        && attr.value.toLowerCase().split(/\s+/).includes("stylesheet"))) {
        errors.push({ file: source.entry, message: "External stylesheets are not supported" });
        return false;
      }
      // Template children live in a separate document fragment in parse5.
      if ("content" in node) visit(node.content, true);
    }
    if ("childNodes" in node) node.childNodes = node.childNodes.filter((child) => visit(child, inert));
    return true;
  }
  visit(document);
  if (errors.length) return { ok: false, errors };
  return {
    ok: true,
    screen: {
      kind: "html", styles, script: scripts.join("\n;\n"),
      html: [...headDataScripts, ...(body?.childNodes ?? [])].map((child) => serializeOuter(child)).join(""),
      links: extractLinks(source.files),
    },
  };
}

export function compileScreen(source: ScreenSource, options: CompileOptions): CompileResult {
  if (!Object.hasOwn(source.files, source.entry)) {
    return { ok: false, errors: [{ file: source.entry, message: `File not found: ${source.entry}` }] };
  }
  return source.kind === "react" ? compileReact(source, options) : compileHtml(source, options);
}
