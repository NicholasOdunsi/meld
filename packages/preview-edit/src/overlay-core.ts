export const COMPUTED_KEYS = [
  "fontFamily", "fontSize", "fontWeight", "color", "backgroundColor",
  "width", "height", "padding", "gap", "borderRadius", "display",
] as const;
export type Computed = Record<(typeof COMPUTED_KEYS)[number], string>;

// The web panel accepts these caps (computedSchema in live/live-messages.ts).
const CAPS: Record<(typeof COMPUTED_KEYS)[number], number> = {
  fontFamily: 120, fontSize: 12, fontWeight: 12, color: 40, backgroundColor: 40,
  width: 12, height: 12, padding: 12, gap: 12, borderRadius: 12, display: 20,
};
const SKIPPED = new Set(["HTML", "BODY", "HEAD", "SCRIPT", "STYLE", "LINK", "META", "NOSCRIPT"]);

export function isPickable(el: Element): boolean {
  return el.nodeType === 1 && !SKIPPED.has(el.tagName);
}

// A shorthand such as "4px 8px 4px 8px" is shown as its first value.
const first = (value: string) => value.trim().split(/\s+/)[0] ?? "";

export function readComputed(el: Element, win: Window): Computed {
  const style = win.getComputedStyle(el);
  const raw: Record<(typeof COMPUTED_KEYS)[number], string> = {
    fontFamily: style.fontFamily, fontSize: style.fontSize, fontWeight: style.fontWeight,
    color: style.color, backgroundColor: style.backgroundColor, width: style.width, height: style.height,
    padding: first(style.padding), gap: first(style.gap), borderRadius: first(style.borderRadius), display: style.display,
  };
  const out = {} as Computed;
  for (const key of COMPUTED_KEYS) out[key] = raw[key].slice(0, CAPS[key]);
  return out;
}

export function describeElement(el: Element, win: Window) {
  return {
    tag: el.tagName.toLowerCase(),
    text: (el.textContent ?? "").trim().slice(0, 200),
    html: el.outerHTML.slice(0, 600),
    computed: readComputed(el, win),
  };
}

export function pathTo(el: Element, root: Element): number[] {
  const path: number[] = [];
  for (let node: Element | null = el; node && node !== root; node = node.parentElement) {
    const parent: Element | null = node.parentElement;
    if (!parent) return [];
    path.unshift(Array.prototype.indexOf.call(parent.children, node));
  }
  return path;
}

export function elementAt(root: Element, path: readonly number[]): Element | null {
  let node: Element | undefined = root;
  for (const index of path) {
    node = node?.children[index];
    if (!node) return null;
  }
  return node ?? null;
}

// Editing text in place is only offered for text-only elements: restoring or reporting
// textContent on an element with child elements would flatten or lose them.
export function canEditText(el: Element): boolean {
  return el.children.length === 0;
}

export type HandleKind = "right" | "bottom" | "corner";
export type Size = { width: number; height: number };

// Only the dimensions the handle can change AND that really changed are reported, so a plain
// click on a handle never writes the current size into the user's code.
export function changedSize(kind: HandleKind, start: Size, end: Size): { width?: number; height?: number } | null {
  const out: { width?: number; height?: number } = {};
  if (kind !== "bottom" && end.width !== start.width) out.width = end.width;
  if (kind !== "right" && end.height !== start.height) out.height = end.height;
  return Object.keys(out).length ? out : null;
}
