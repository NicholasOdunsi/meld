import { packages } from "@babel/standalone";
import type { NodePath, types as t } from "@babel/core";
import {
  descriptor,
  emptyBindings,
  type Binding,
  type EditableNode,
} from "./patch";
import {
  blankInsertOffset,
  edges,
  isBlank,
  NO_TEXT_TAGS,
  SVG_TEXT_TAGS,
  TEXT_TAGS,
  textBinding as runsBinding,
  VOID_TAGS,
  type Content,
  type Run,
} from "./runs";
import {
  changeUtility,
  cssValue,
  familyKeyOf,
  utilityBlocked,
  utilityValue,
} from "./style";
import { FIELDS, type Range } from "./types";

function literal(node: t.Node | null | undefined): string | null {
  return node?.type === "StringLiteral"
    ? node.value
    : node?.type === "NumericLiteral"
      ? String(node.value)
      : null;
}
// Escaped identifiers can hide a CSS function name; decline them conservatively.
function hasDynamicCss(value: string): boolean {
  const withoutComments = value.replace(/\/\*[\s\S]*?\*\//g, "");
  return (
    value.includes("\\") || /(?:var|env|calc|attr)\s*\(/i.test(withoutComments)
  );
}

function attributeValue(attr: t.JSXAttribute): t.Node | null {
  return attr.value?.type === "JSXExpressionContainer"
    ? attr.value.expression
    : (attr.value ?? null);
}
const rawTextTags = [
  "script",
  "style",
  "textarea",
  "title",
  "xmp",
  "plaintext",
  "noscript",
  "iframe",
];
// The string Babel makes of a JSX text child: lines trimmed where they meet a line break, blank
// lines dropped, the rest joined with one space (Babel's cleanJSXElementLiteralChild).
export function jsxTextValue(value: string): string {
  const lines = value.split(/\r\n|\n|\r/);
  let lastNonEmpty = 0;
  lines.forEach((line, i) => {
    if (/[^ \t]/.test(line)) lastNonEmpty = i;
  });
  let out = "";
  lines.forEach((line, i) => {
    let text = line.replace(/\t/g, " ");
    if (i !== 0) text = text.replace(/^[ ]+/, "");
    if (i !== lines.length - 1) text = text.replace(/[ ]+$/, "");
    if (text) out += i === lastNonEmpty ? text : text + " ";
  });
  return out;
}
// Whether typing may go into this element when it has no text: not a void, replaced, foreign or
// structural element (inside an <svg>, only its text elements).
function takesText(path: NodePath<t.JSXElement>): boolean {
  const name = (path.node.openingElement.name as t.JSXIdentifier).name;
  if (VOID_TAGS.has(name) || NO_TEXT_TAGS.has(name)) return false;
  for (
    let at = path.parentPath as NodePath | null;
    at;
    at = at.parentPath as NodePath | null
  ) {
    if (!at.isJSXElement()) continue;
    const parent = at.node.openingElement.name;
    if (parent.type === "JSXIdentifier" && parent.name === "svg")
      return SVG_TEXT_TAGS.has(name);
  }
  return true;
}
const preTags = new Set(["pre", "listing", "plaintext"]);
// Inline whiteSpace / white-space: pre* or a whitespace-pre* utility on the element or an ancestor.
// Read from the opening tag's source, so it errs towards read-only. A white-space: pre* rule in a
// stylesheet cannot be seen from the element's source, so such text is treated as normal flow.
const preserving =
  /whiteSpace\s*:\s*["'`](?:pre|break-spaces)|white-?[sS]pace-?[cC]ollapse\s*:\s*["'`]?(?:preserve|break-spaces)|white-space\s*:\s*(?:pre|break-spaces)|\bwhitespace-(?:pre|break-spaces)/;
function preserves(source: string, path: NodePath<t.JSXElement>): boolean {
  for (
    let at: NodePath | null = path;
    at;
    at = at.parentPath as NodePath | null
  ) {
    if (!at.isJSXElement()) continue;
    const opening = at.node.openingElement;
    if (opening.name.type === "JSXIdentifier" && preTags.has(opening.name.name))
      return true;
    if (
      opening.start != null &&
      opening.end != null &&
      preserving.test(source.slice(opening.start, opening.end))
    )
      return true;
  }
  return false;
}
// An emptied run must remember which whitespace was before/after its text. The literal alone
// cannot distinguish a leading separator from a trailing one once its text has been removed.
function runLiteral(value: string, lead: string, trail: string, keepEmpty?: boolean): string {
  const text = lead + value + trail;
  if (value === "" && keepEmpty && text !== "")
    return `{${JSON.stringify(text)}/*orion-text-run:${lead.length}*/}`;
  return text === "" && !keepEmpty ? "" : `{${JSON.stringify(text)}}`;
}
function contentOf(source: string, path: NodePath<t.JSXElement>): Content {
  const node = path.node;
  const content: Content = {
    runs: [],
    dynamic: 0,
    elements: 0,
    insert: null,
    preserve: preserves(source, path),
    textTag: TEXT_TAGS.has(
      (node.openingElement.name as t.JSXIdentifier).name,
    ),
  };
  // Blank runs typing can fill: whether they render a space (a {" "} or a one-line " "), and how
  // many elements come before them.
  const blanks: { run: Run; renders: boolean; before: number }[] = [];
  for (const child of node.children) {
    const from = child.start,
      to = child.end;
    if (child.type === "JSXElement" || child.type === "JSXFragment") {
      content.elements += 1;
      continue;
    }
    if (
      child.type === "JSXExpressionContainer" &&
      child.expression.type === "JSXEmptyExpression"
    )
      continue;
    if (from == null || to == null) {
      content.dynamic += 1;
      continue;
    }
    if (child.type === "JSXText") {
      const raw = source.slice(from, to);
      const outer = edges(raw);
      // Whitespace with a line break is layout only: it stays in the source as written.
      const keepLead = /[\r\n]/.test(outer.lead) ? outer.lead : "";
      const keepTrail = /[\r\n]/.test(outer.trail) ? outer.trail : "";
      const text = jsxTextValue(child.value);
      const inner = edges(text);
      const run: Run = {
        from,
        to,
        text,
        write: (value, keepEmpty) => {
          return keepLead + runLiteral(value, inner.lead, inner.trail, keepEmpty) + keepTrail;
        },
      };
      content.runs.push(run);
      if (isBlank(text))
        blanks.push({ run, renders: text !== "", before: content.elements });
      continue;
    }
    if (
      child.type === "JSXExpressionContainer" &&
      child.expression.type === "StringLiteral"
    ) {
      const text = child.expression.value;
      const inner = edges(text);
      const marker = /\/\*orion-text-run:(\d+)\*\/\s*\}$/.exec(source.slice(from, to));
      const split = marker && isBlank(text) ? Number(marker[1]) : null;
      if (split !== null && Number.isSafeInteger(split) && split <= text.length) {
        inner.lead = text.slice(0, split);
        inner.trail = text.slice(split);
      }
      const run: Run = {
        from,
        to,
        text,
        emptySlot: isBlank(text),
        write: (value, keepEmpty) => runLiteral(value, inner.lead, inner.trail, keepEmpty),
      };
      content.runs.push(run);
      if (isBlank(text))
        blanks.push({ run, renders: true, before: content.elements });
      continue;
    }
    content.dynamic += 1;
  }
  const closing = node.closingElement,
    opening = node.openingElement;
  if (closing && opening.end != null && takesText(path)) {
    // Only used when every run is blank. A run that renders a space ({" "}, or " " on one line) is
    // rewritten as one literal with the typed text before or after the space, never leaving a stray
    // {" "}; layout whitespace (with a line break) gets the literal after its first line break.
    const slot = blanks.find((blank) => blank.renders) ?? blanks[0];
    const at = opening.end;
    content.insert = (value) => {
      if (!slot)
        return {
          from: at,
          to: at,
          value: value === "" ? "" : `{${JSON.stringify(value)}}`,
        };
      const { run } = slot;
      if (value === "")
        return { from: run.from, to: run.to, value: source.slice(run.from, run.to) };
      if (slot.renders) {
        const follows = content.elements > slot.before;
        return {
          from: run.from,
          to: run.to,
          value: `{${JSON.stringify(follows ? value + run.text : run.text + value)}}`,
        };
      }
      const offset = run.from + blankInsertOffset(source.slice(run.from, run.to), true);
      return { from: offset, to: offset, value: `{${JSON.stringify(value)}}` };
    };
  }
  return content;
}
function textBinding(
  source: string,
  path: NodePath<t.JSXElement>,
): Binding | null {
  const name = path.node.openingElement.name as t.JSXIdentifier;
  return rawTextTags.includes(name.name)
    ? null
    : runsBinding(contentOf(source, path));
}
function bindingsFor(
  source: string,
  path: NodePath<t.JSXElement>,
): EditableNode {
  const node = path.node;
  const bindings = emptyBindings();
  const attrs = new Map<string, t.JSXAttribute>();
  for (const attr of node.openingElement.attributes) {
    if (
      attr.type === "JSXSpreadAttribute" ||
      attr.name.type !== "JSXIdentifier" ||
      attrs.has(attr.name.name)
    )
      return descriptor(bindings);
    attrs.set(attr.name.name, attr);
  }
  bindings.text = textBinding(source, path);
  const classAttr = attrs.get("className"),
    styleAttr = attrs.get("style");
  const classNode = classAttr ? attributeValue(classAttr) : null;
  const classes = classNode?.type === "StringLiteral" ? classNode.value : null;
  if (classAttr && classes === null) return descriptor(bindings);
  const styleNode = styleAttr ? attributeValue(styleAttr) : null;
  if (styleAttr && styleNode?.type !== "ObjectExpression")
    return descriptor(bindings);
  const object = styleNode?.type === "ObjectExpression" ? styleNode : null;
  const properties = new Map<string, (t.ObjectProperty | t.ObjectMethod)[]>();
  if (object) {
    for (const prop of object.properties) {
      if (prop.type === "SpreadElement" || prop.computed)
        return descriptor(bindings);
      const key =
        prop.key.type === "Identifier" ? prop.key.name : literal(prop.key);
      if (key === null) return descriptor(bindings);
      properties.set(key, [...(properties.get(key) ?? []), prop]);
    }
  }
  for (const field of FIELDS) {
    if (field === "text") continue;
    if (classes !== null && utilityBlocked(classes, field)) continue;
    const conflicts = [...properties.keys()].some(
      (key) =>
        key === "all" ||
        ((field === "fontSize" || field === "fontWeight") && key === "font") ||
        (field === "fontFamily" && key === "font") ||
        (field === "backgroundColor" && key === "background") ||
        (field === "padding" && /^padding[A-Z]/.test(key)) ||
        (field === "gap" && (key === "rowGap" || key === "columnGap")) ||
        (field === "borderRadius" && /^border.+Radius$/.test(key)),
    );
    if (conflicts) continue;
    const props = properties.get(field) ?? [];
    if (props.length > 1) continue;
    const prop = props[0];
    const current =
      prop?.type === "ObjectProperty" && !prop.shorthand
        ? literal(prop.value)
        : null;
    if (prop && (current === null || hasDynamicCss(current))) continue;
    const utility = classes === null ? null : utilityValue(classes, field);
    if (prop && utility !== null) continue;
    if (utility !== null && classAttr) {
      bindings[field] = {
        value: utility,
        make: (input) => {
          const value = changeUtility(classes!, { field, value: input });
          return value === null ||
            classAttr.value?.start == null ||
            classAttr.value.end == null
            ? null
            : {
                from: classAttr.value.start,
                to: classAttr.value.end,
                value: `{${JSON.stringify(value)}}`,
              };
        },
      };
      continue;
    }
    bindings[field] = {
      value:
        current == null
          ? null
          : field === "fontFamily"
            ? familyKeyOf(current)
            : current.replace(/px$/i, ""),
      make: (input) => {
        const value = cssValue({ field, value: input });
        if (value === null) return null;
        const serialized = JSON.stringify(value);
        if (prop?.type === "ObjectProperty") {
          if (prop.value.start == null || prop.value.end == null) return null;
          return {
            from: prop.value.start,
            to: prop.value.end,
            value: serialized,
          };
        }
        if (object) {
          const last = object.properties.at(-1);
          const at = last
            ? last.end
            : object.start == null
              ? null
              : object.start + 1;
          return at == null
            ? null
            : {
                from: at,
                to: at,
                value: `${last ? "," : ""}${field}:${serialized}`,
              };
        }
        const at = node.openingElement.name.end;
        return at == null
          ? null
          : { from: at, to: at, value: ` style={{${field}:${serialized}}}` };
      },
    };
  }
  return descriptor(bindings);
}
export function locateJsx(source: string, range: Range): EditableNode | null {
  try {
    const ast = packages.parser.parse(source, {
      sourceType: "unambiguous",
      plugins: /\.tsx?$/.test(range.file) ? ["typescript", "jsx"] : ["jsx"],
    });
    let found: NodePath<t.JSXElement> | null = null;
    packages.traverse.default(ast, {
      JSXElement(path) {
        const node = path.node,
          name = node.openingElement.name;
        if (
          name.type === "JSXIdentifier" &&
          /^[a-z]/.test(name.name) &&
          node.start === range.start &&
          node.end === range.end
        ) {
          found = path;
          path.stop();
        }
      },
    });
    return found ? bindingsFor(source, found) : null;
  } catch {
    return null;
  }
}
