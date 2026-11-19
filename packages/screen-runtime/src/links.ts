import type { PluginObj, types as BabelTypes } from "@babel/core";
import { transform } from "@babel/standalone";
import { parse, type DefaultTreeAdapterTypes } from "parse5";
import { MAX_SCREEN_LINKS, SCREEN_KEY } from "./constants";

const SCRIPT_TYPES = new Set([
  "", "module", "text/javascript", "application/javascript",
  "text/ecmascript", "application/ecmascript",
]);

export function extractLinks(files: Record<string, string>): string[] {
  const links = new Set<string>();
  function add(value: string) {
    if (SCREEN_KEY.test(value)) links.add(value);
  }

  function readScript(source: string, filename: string, handler = false) {
    try {
      transform(handler ? `function handler(event) {\n${source}\n}` : source, {
        filename,
        code: false,
        ast: false,
        sourceType: "unambiguous",
        parserOpts: { plugins: /\.tsx?$/.test(filename) ? ["typescript", "jsx"] : ["jsx"] },
        plugins: [({ types: t }: { types: typeof BabelTypes }): PluginObj => ({
          visitor: {
            CallExpression({ node }) {
              const { callee, arguments: args } = node;
              if (t.isMemberExpression(callee) && !callee.computed
                && t.isIdentifier(callee.object, { name: "orion" })
                && t.isIdentifier(callee.property, { name: "goto" })
                && t.isStringLiteral(args[0])) add(args[0].value);
            },
            JSXAttribute({ node }) {
              if (!t.isJSXIdentifier(node.name, { name: "data-goto" })) return;
              const value = t.isJSXExpressionContainer(node.value) ? node.value.expression : node.value;
              if (t.isStringLiteral(value)) add(value.value);
            },
          },
        })],
      });
    } catch {
      // Compilation reports syntax errors separately; malformed files have no AST to inspect.
    }
  }

  function readHtml(node: DefaultTreeAdapterTypes.Node) {
    if ("attrs" in node) {
      for (const { name, value } of node.attrs) {
        if (name === "data-goto") add(value);
        else if (name.startsWith("on")) readScript(value, "handler.js", true);
      }
      if (node.tagName === "script" && !node.attrs.some(({ name }) => name === "src")) {
        const type = node.attrs.find(({ name }) => name === "type")?.value ?? "";
        if (SCRIPT_TYPES.has(type.split(";", 1)[0].trim().toLowerCase())) {
          const source = node.childNodes.map((child) => "value" in child ? child.value : "").join("");
          readScript(source, "inline.js");
        }
      }
    }
    if ("childNodes" in node) node.childNodes.forEach(readHtml);
  }

  for (const [filename, source] of Object.entries(files)) {
    if (/\.(?:tsx?|jsx?)$/.test(filename)) readScript(source, filename);
    else if (/\.html$/.test(filename)) readHtml(parse(source));
  }

  return [...links].sort().slice(0, MAX_SCREEN_LINKS);
}
