import type { PluginObj, types as BabelTypes } from "@babel/core";
import { TAG_ATTRIBUTE } from "./constants";

export function tagElementsPlugin(file: string) {
  return ({ types: t }: { types: typeof BabelTypes }): PluginObj => ({
    name: "orion-tag-elements",
    visitor: {
      JSXElement(path) {
        const { openingElement, start, end } = path.node;
        const { name, attributes } = openingElement;
        if (!t.isJSXIdentifier(name) || !/^[a-z]/.test(name.name)) return;
        if (start == null || end == null) return;
        if (attributes.some((attribute) => t.isJSXAttribute(attribute)
          && t.isJSXIdentifier(attribute.name, { name: TAG_ATTRIBUTE }))) return;
        attributes.push(t.jsxAttribute(
          t.jsxIdentifier(TAG_ATTRIBUTE),
          t.stringLiteral(`${file}:${start}:${end}`),
        ));
      },
    },
  });
}

export function parseTag(value: string): { file: string; start: number; end: number } | null {
  const match = /^(.+):(\d+):(\d+)$/.exec(value);
  if (!match || match[0] !== value) return null;
  const start = Number(match[2]);
  const end = Number(match[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) return null;
  return { file: match[1], start, end };
}
