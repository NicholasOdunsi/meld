import { parse, type DefaultTreeAdapterMap } from "parse5";
import postcss, { type Declaration, type Root } from "postcss";
import {
  descriptor,
  emptyBindings,
  type EditableNode,
  type Patch,
} from "./patch";
import {
  changeUtility,
  cssValue,
  utilityBlocked,
  utilityField,
  utilityValue,
} from "./style";
import { FIELDS, type Field, type Range } from "./types";
type Element = DefaultTreeAdapterMap["element"];
type Node = DefaultTreeAdapterMap["node"];
const properties: Record<Exclude<Field, "text">, string> = {
  color: "color",
  backgroundColor: "background-color",
  fontSize: "font-size",
  fontWeight: "font-weight",
  padding: "padding",
  gap: "gap",
  borderRadius: "border-radius",
  width: "width",
  height: "height",
};
const rawText = new Set([
  "style",
  "script",
  "textarea",
  "title",
  "xmp",
  "plaintext",
  "noscript",
  "iframe",
  "noembed",
  "noframes",
]);
function htmlText(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}
function quoted(value: string): string {
  return '"' + htmlText(value).replaceAll('"', "&quot;") + '"';
}
// parse5 deliberately drops duplicate attributes; retain their authored names for ownership checks.
function attributeNames(tag: string): {
  names: string[];
  close: number;
} {
  const names: string[] = [];
  let i = 1;
  while (i < tag.length && !/[\s/>]/.test(tag[i])) i++;
  while (i < tag.length) {
    while (/\s/.test(tag[i] ?? "")) i++;
    if (
      i >= tag.length ||
      tag[i] === ">" ||
      (tag[i] === "/" && tag[i + 1] === ">")
    )
      break;
    const start = i;
    while (i < tag.length && !/[\s=/>]/.test(tag[i])) i++;
    if (i === start) {
      i++;
      continue;
    }
    names.push(tag.slice(start, i).toLowerCase());
    while (/\s/.test(tag[i] ?? "")) i++;
    if (tag[i] !== "=") continue;
    i++;
    while (/\s/.test(tag[i] ?? "")) i++;
    if (tag[i] === '"' || tag[i] === "'") {
      const quote = tag[i++];
      while (i < tag.length && tag[i] !== quote) i++;
      if (i < tag.length) i++;
    } else while (i < tag.length && !/[\s>]/.test(tag[i])) i++;
  }
  return {
    names,
    close: i,
  };
}
function declarations(value: string): Root | null {
  try {
    const root = postcss.parse(value, {
      from: undefined,
    });
    return root.nodes.every((n) => n.type === "decl" || n.type === "comment")
      ? root
      : null;
  } catch {
    return null;
  }
}
function dynamic(value: string): boolean {
  return /(?:var|calc|env|attr)\s*\(/i.test(value) || /\\|\/\*/.test(value);
}
function bindingsFor(source: string, node: Element): EditableNode {
  const bindings = emptyBindings(),
    location = node.sourceCodeLocation!;
  const startTag = location.startTag!;
  const { names, close } = attributeNames(
    source.slice(startTag.startOffset, startTag.endOffset),
  );
  const duplicate = (name: string) =>
    names.filter((n) => n === name).length > 1;
  const attr = (name: string) => node.attrs.find((a) => a.name === name)?.value;
  const put = (name: string, value: string): Patch => {
    const existing = location.attrs?.[name];
    if (existing)
      return {
        from: existing.startOffset,
        to: existing.endOffset,
        value: name + "=" + quoted(value),
      };
    const at = startTag.startOffset + close;
    return {
      from: at,
      to: at,
      value: " " + name + "=" + quoted(value),
    };
  };
  if (!rawText.has(node.tagName) && node.childNodes.length === 1) {
    const child = node.childNodes[0];
    if (
      child.nodeName === "#text" &&
      "value" in child &&
      child.sourceCodeLocation
    ) {
      const { startOffset: from, endOffset: to } = child.sourceCodeLocation;
      bindings.text = {
        value: child.value,
        make: (value) => ({
          from,
          to,
          value: htmlText(value),
        }),
      };
    }
  }
  const className = attr("class"),
    style = attr("style");
  const css = style === undefined ? postcss.root() : declarations(style);
  for (const field of FIELDS) {
    if (field === "text" || duplicate("class") || duplicate("style") || !css)
      continue;
    if (className !== undefined && utilityBlocked(className, field)) continue;
    const property = properties[field];
    const conflicts = (prop: string): boolean => {
      if (prop === "all") return true;
      if ((field === "fontSize" || field === "fontWeight") && prop === "font")
        return true;
      if (field === "backgroundColor" && prop === "background") return true;
      if (field === "padding" && prop.startsWith("padding-")) return true;
      if (field === "gap" && (prop === "row-gap" || prop === "column-gap"))
        return true;
      if (
        field === "borderRadius" &&
        /^border-.*-radius$/.test(prop) &&
        prop !== property
      )
        return true;
      return false;
    };
    if (
      css.nodes.some(
        (n) => n.type === "decl" && conflicts(n.prop.toLowerCase()),
      )
    )
      continue;
    const hits = css.nodes.filter(
      (n): n is Declaration =>
        n.type === "decl" && n.prop.toLowerCase() === property,
    );
    if (
      hits.length > 1 ||
      css.nodes.some((n) => n.type === "decl" && /\\/.test(n.prop)) ||
      (hits[0] && dynamic(hits[0].value))
    )
      continue;
    const hasUtility =
      className !== undefined &&
      className.split(/\s+/).some((token) => utilityField(token) === field);
    if (hits[0] && hasUtility) continue;
    const current = hits[0];
    bindings[field] = {
      value: current
        ? current.value.replace(/px$/i, "")
        : className === undefined
          ? null
          : utilityValue(className, field),
      make: (input) => {
        const tweak = {
          field,
          value: input,
        };
        const value = cssValue(tweak);
        if (value === null) return null;
        if (!current && className !== undefined) {
          const changed = changeUtility(className, tweak);
          if (changed !== null) return put("class", changed);
        }
        const updated = css.clone();
        if (current) {
          const target = updated.nodes[
            css.nodes.indexOf(current)
          ] as Declaration;
          target.value = value;
        } else
          updated.append({
            prop: property,
            value,
          });
        return put("style", updated.toString());
      },
    };
  }
  return descriptor(bindings);
}
export function locateHtml(source: string, range: Range): EditableNode | null {
  if (
    !Number.isInteger(range.start) ||
    !Number.isInteger(range.end) ||
    range.start < 0 ||
    range.start >= range.end ||
    range.end > source.length
  )
    return null;
  try {
    const root = parse(source, {
      sourceCodeLocationInfo: true,
    });
    let found: Element | null = null;
    const visit = (node: Node): void => {
      if ("tagName" in node) {
        const loc = node.sourceCodeLocation;
        if (
          loc?.startTag &&
          loc.startOffset === range.start &&
          loc.endOffset === range.end
        )
          found = node;
      }
      if ("childNodes" in node)
        for (const child of node.childNodes) visit(child);
      if ("content" in node) visit(node.content);
    };
    visit(root);
    return found ? bindingsFor(source, found) : null;
  } catch {
    return null;
  }
}
