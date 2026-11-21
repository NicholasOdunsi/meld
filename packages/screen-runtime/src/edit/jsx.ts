import { packages } from "@babel/standalone";
import type { types as t } from "@babel/core";
import {
  descriptor,
  emptyBindings,
  type Binding,
  type EditableNode,
} from "./patch";
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
function textBinding(node: t.JSXElement): Binding | null {
  if (
    [
      "script",
      "style",
      "textarea",
      "title",
      "xmp",
      "plaintext",
      "noscript",
      "iframe",
    ].includes((node.openingElement.name as t.JSXIdentifier).name) ||
    node.children.length !== 1
  )
    return null;
  const child = node.children[0];
  const value =
    child.type === "JSXText"
      ? child.value
      : child.type === "JSXExpressionContainer" &&
          child.expression.type === "StringLiteral"
        ? child.expression.value
        : null;
  if (value === null || child.start == null || child.end == null) return null;
  const from = child.start,
    to = child.end;
  return {
    value,
    make: (input) => ({ from, to, value: `{${JSON.stringify(input)}}` }),
  };
}
function bindingsFor(node: t.JSXElement): EditableNode {
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
  bindings.text = textBinding(node);
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
    let found: t.JSXElement | null = null;
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
          found = node;
          path.stop();
        }
      },
    });
    return found ? bindingsFor(found) : null;
  } catch {
    return null;
  }
}
