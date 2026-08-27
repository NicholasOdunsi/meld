import { readFileSync, readdirSync, statSync } from "node:fs";
import { extname, join } from "node:path";
import { pathToFileURL } from "node:url";

const COLOR_FUNCTION =
  /\b(?:rgb|rgba|hsl|hsla|hwb|lab|lch|oklab|oklch|color)\s*\(/i;
const COLOR_PROPERTIES = new Set([
  "accentcolor",
  "background",
  "backgroundcolor",
  "bordercolor",
  "bordertopcolor",
  "borderrightcolor",
  "borderbottomcolor",
  "borderleftcolor",
  "caretcolor",
  "color",
  "fill",
  "outlinecolor",
  "stroke",
  "textdecorationcolor",
]);
const NON_LITERAL_COLOR_VALUES = new Set([
  "currentcolor",
  "inherit",
  "initial",
  "none",
  "revert",
  "revert-layer",
  "transparent",
  "unset",
]);
// The Meld design system owns its own markup and its own raw values, so two
// narrow exemptions apply inside it -- and only inside it.
//
// Primitives may use raw elements: a <button> or <input> that renders through
// an Astryx layout wrapper is not a primitive, it's a re-skin. This is the one
// directory whose job is to own markup directly.
//
// The token source may use literal hex and px: it is where the palette and the
// scale are *defined*. Everything downstream, including every other file in
// this directory, must reach them through var().
const DESIGN_SYSTEM_DIRECTORY = "apps/web/src/ui/meld/";
const DESIGN_SYSTEM_TOKEN_SOURCE = "apps/web/src/ui/meld/tokens.css";

function toPosixPath(path) {
  return path.split(/[\\/]/).join("/");
}

export function isDesignSystemPrimitive(path) {
  return typeof path === "string"
    ? toPosixPath(path).includes(DESIGN_SYSTEM_DIRECTORY)
    : false;
}

export function isDesignSystemTokenSource(path) {
  return typeof path === "string"
    ? toPosixPath(path).endsWith(DESIGN_SYSTEM_TOKEN_SOURCE)
    : false;
}

const PIXEL_STYLE_PROPERTIES =
  /^(?:width|height|minWidth|maxWidth|minHeight|maxHeight|margin(?:Block|Inline|Top|Right|Bottom|Left|BlockStart|BlockEnd|InlineStart|InlineEnd)?|padding(?:Block|Inline|Top|Right|Bottom|Left|BlockStart|BlockEnd|InlineStart|InlineEnd)?|gap|rowGap|columnGap|inset(?:Block|Inline|BlockStart|BlockEnd|InlineStart|InlineEnd)?|top|right|bottom|left|borderRadius|borderWidth|fontSize|letterSpacing|outlineWidth)$/;

function collectDeclarationsFromBody(body) {
  const declarations = [];
  const pattern =
    /(?:^|[;,{])\s*((?:--)?[a-zA-Z][\w-]*)\s*:\s*([^;,\n}]+)/gm;
  for (const match of body.matchAll(pattern)) {
    declarations.push({ property: match[1], value: match[2].trim() });
  }
  return declarations;
}

function collectInlineStyleBodies(source) {
  return [...source.matchAll(/style\s*=\s*\{\{([\s\S]*?)\}\}/g)].map(
    (match) => match[1],
  );
}

function isCssSelector(header) {
  if (
    /(?:=>|=|\b(?:const|let|var|function|if|for|while|switch|interface|type|return)\b)/.test(
      header,
    )
  ) {
    return false;
  }
  return /^(?:[.#:*@[]|[a-z][\w-]*(?:$|[\s.#:>+~[]))/i.test(header);
}

function collectCssRuleBodies(source) {
  const bodies = [];
  const pattern = /(?:^|[\n}])\s*([^{}\n]+?)\s*\{([^{}]*)\}/g;
  for (const match of source.matchAll(pattern)) {
    if (isCssSelector(match[1].trim())) bodies.push(match[2]);
  }
  return bodies;
}

function collectStyleDeclarations(source) {
  return [
    ...collectInlineStyleBodies(source),
    ...collectCssRuleBodies(source),
  ].flatMap(collectDeclarationsFromBody);
}

function isHardcodedColor(property, value) {
  const normalizedProperty = property.replaceAll("-", "").toLowerCase();
  const normalizedValue = value
    .trim()
    .replace(/^["'`]|["'`]$/g, "")
    .trim();
  if (normalizedValue.startsWith("var(")) return false;
  if (/#[0-9a-f]{3,8}\b/i.test(normalizedValue)) return true;
  if (COLOR_FUNCTION.test(normalizedValue)) return true;
  if (!COLOR_PROPERTIES.has(normalizedProperty)) return false;
  return (
    /^[a-z-]+$/i.test(normalizedValue) &&
    !NON_LITERAL_COLOR_VALUES.has(normalizedValue.toLowerCase())
  );
}

function hasHardcodedPixel(source, declarations) {
  if (
    declarations.some((declaration) =>
      /(?:^|["'`\s])-?(?:\d*\.)?\d+px\b/i.test(declaration.value),
    )
  ) {
    return true;
  }

  return collectInlineStyleBodies(source).some((body) => {
    const numericProperty =
      /([a-zA-Z][\w]*)\s*:\s*(-?(?:\d*\.)?\d+)(?=\s*(?:,|$))/g;
    for (const match of body.matchAll(numericProperty)) {
      const value = Number(match[2]);
      if (PIXEL_STYLE_PROPERTIES.test(match[1]) && value !== 0) return true;
    }
    return false;
  });
}

export function checkSource(source, path) {
  const failures = [];
  const declarations = collectStyleDeclarations(source);
  const ownsMarkup = isDesignSystemPrimitive(path);
  const ownsRawValues = isDesignSystemTokenSource(path);
  if (!ownsMarkup) {
    if (/<div(?:\s|>)/.test(source)) failures.push("raw <div> layout");
    if (/<span(?:\s|>)/.test(source)) failures.push("raw <span> layout");
  }
  if (
    /className=(?:["'`])[^"'`]*(?:\bp-\d|\bm-\d|\bflex\b|\bgrid\b|\bbg-|\btext-)/.test(
      source,
    )
  ) {
    failures.push("utility class");
  }
  if (
    !ownsRawValues &&
    declarations.some(({ property, value }) =>
      isHardcodedColor(property, value),
    )
  ) {
    failures.push("hardcoded color");
  }
  if (!ownsRawValues && hasHardcodedPixel(source, declarations)) {
    failures.push("hardcoded pixel");
  }
  if (
    /@apply\b|@tailwind\b|tailwindcss|stylex\.create\s*\(|\bxstyle\s*=/.test(
      source,
    )
  ) {
    failures.push("Tailwind/StyleX compiler usage");
  }
  return failures;
}

export function checkTree(root) {
  const failures = [];
  for (const name of readdirSync(root)) {
    const path = join(root, name);
    if (statSync(path).isDirectory()) {
      failures.push(...checkTree(path));
    } else if ([".tsx", ".ts", ".css"].includes(extname(path))) {
      for (const failure of checkSource(readFileSync(path, "utf8"), path)) {
        failures.push(`${path}: ${failure}`);
      }
    }
  }
  return failures;
}

function run() {
  const roots = process.argv.slice(2);
  if (roots.length === 0) {
    console.error("Usage: node scripts/check-astryx-conventions.mjs <root> [...]");
    process.exitCode = 1;
    return;
  }

  const failures = roots.flatMap((root) => checkTree(root));
  for (const failure of failures) console.error(failure);
  if (failures.length > 0) process.exitCode = 1;
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(process.argv[1]).href
) {
  run();
}
