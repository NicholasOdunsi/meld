// Text runs: the direct text children of an element, between its other children (elements, <br>,
// comments, {expressions}). HTML and JSX each list their element's children as `Content`; the rules
// for which text is editable, what the Text field shows and what an edit writes live here, once.
import type { Binding, Patch } from "./patch";
import { MAX_TEXT_RUNS } from "./types";

// HTML's own whitespace. A no-break space (&nbsp;) is text, not whitespace, so it is kept.
const SPACE = /[ \t\n\r\f]+/g;
const EDGE = /^[ \t\n\r\f]+|[ \t\n\r\f]+$/g;

// What a reader sees of some text in normal flow: runs of whitespace are one space, none at the edges.
export function collapse(text: string): string {
  return text.replace(SPACE, " ").replace(EDGE, "");
}
export function isBlank(text: string): boolean {
  return text.replace(EDGE, "") === "";
}
export function trimEdges(text: string): string {
  return text.replace(EDGE, "");
}
export function edges(text: string): { lead: string; trail: string } {
  const lead = /^[ \t\n\r\f]*/.exec(text)![0];
  if (lead === text) return { lead, trail: "" };
  return { lead, trail: /[ \t\n\r\f]*$/.exec(text)![0] };
}

export type Run = {
  // The run's source range (the text node, or the JSX text or {"literal"}).
  from: number;
  to: number;
  // The text it renders, entities decoded.
  text: string;
  // The source that replaces from..to so the run renders `value` (already trimmed), keeping the
  // run's own leading and trailing whitespace.
  write: (value: string, keepEmpty?: boolean) => string;
  // An explicit empty literal/marker is an editable slot, unlike layout indentation.
  emptySlot?: boolean;
  // Reserved HTML markers must be replaced, including when Code leaves only one slot.
  marker?: boolean;
};
export type Content = {
  // Direct text runs in document order, blank ones included.
  runs: Run[];
  // Children whose text the source cannot show statically: {name}, {`template`}, ...
  dynamic: number;
  // Element children (spans, <br>, <svg>, ...). Comments are not counted.
  elements: number;
  // Where typing goes when the element has no text (an emptied <p></p>); null when it cannot hold text.
  insert: ((value: string) => Patch) | null;
  // Whitespace is shown as written (<pre>, white-space: pre*): only lossless edits are allowed.
  preserve: boolean;
  // The tag holds running text (a heading, a paragraph, a link...): once its text next to other
  // elements is cleared it still takes text, where a layout container (div, section, ul) does not.
  textTag: boolean;
};

// Tags whose text sits next to inline elements (FEATURED <span>BIKES.</span>): clearing that text
// leaves only whitespace and the span, and the Text field must stay so it can be typed again.
export const TEXT_TAGS = new Set([
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "p",
  "a",
  "button",
  "li",
  "span",
  "label",
  "td",
  "th",
  "b",
  "i",
  "strong",
  "em",
  "small",
  "u",
  "s",
  "mark",
  "q",
  "cite",
  "sub",
  "sup",
  "abbr",
  "dt",
  "dd",
  "figcaption",
  "caption",
  "legend",
  "summary",
  "blockquote",
]);
// Replaced, foreign and structural elements: text typed into an empty one would be invisible or
// invalid (an <svg>, a <select>, a <tr>), so they never offer an empty Text field.
export const NO_TEXT_TAGS = new Set([
  "svg",
  "math",
  "canvas",
  "iframe",
  "video",
  "audio",
  "picture",
  "object",
  "embed",
  "img",
  "input",
  "select",
  "datalist",
  "optgroup",
  "textarea",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "colgroup",
  "col",
  "ul",
  "ol",
  "dl",
  "menu",
  "map",
  "template",
  "slot",
]);
export const VOID_TAGS = new Set([
  "area",
  "base",
  "br",
  "col",
  "embed",
  "hr",
  "img",
  "input",
  "link",
  "meta",
  "source",
  "track",
  "wbr",
]);
// Inside an <svg> only these draw text.
export const SVG_TEXT_TAGS = new Set(["text", "tspan", "textPath"]);

// Where typed text goes in a blank run: after its first line break and indentation (so
// "\n  \n" becomes "\n  NEW\n"); without a line break, before the space when an element follows
// (" <span>" becomes "NEW <span>") and after it when the run is last ("<svg/> " becomes "<svg/> NEW").
export function blankInsertOffset(raw: string, elementFollows: boolean): number {
  const lineBreak = /(?:\r\n|\n|\r)[ \t\f]*/.exec(raw);
  if (lineBreak) return lineBreak.index + lineBreak[0].length;
  return elementFollows ? 0 : raw.length;
}

export function nonBlankRuns(content: Content): Run[] {
  return content.runs.filter((run) => !isBlank(run.text));
}

// Which run a tweak edits: the first when it names none, otherwise a whole index below `count`.
function runIndex(index: number | undefined, count: number): number | null {
  if (index === undefined) return 0;
  return Number.isInteger(index) && index >= 0 && index < count ? index : null;
}

// The Text field's binding: editable when the element's text runs (nonblank or explicitly emptied; up to
// MAX_TEXT_RUNS, each its own field) have nothing computed beside them; read-only (make: null) with
// its static text when it has more runs or computed children; null when it holds no text.
// An element with only blank text takes typed text when it is empty, or when it is a text tag whose
// text next to other elements was cleared.
export function textBinding(content: Content): Binding | null {
  const nonblank = nonBlankRuns(content);
  const explicit = content.runs.filter((run) => run.emptySlot);
  // A lone blank literal follows the existing empty-element insertion rules. Multiple explicit
  // slots, or a slot beside another run, retain their position even when all text is cleared.
  const runs = nonblank.length > 0 || explicit.length > 1 || explicit.some((run) => run.marker)
    ? content.runs.filter((run) => run.emptySlot || !isBlank(run.text))
    : [];
  if (runs.length === 0 && content.dynamic === 0) {
    if (!content.insert || (content.elements > 0 && !content.textTag))
      return null;
    const insert = content.insert;
    return {
      value: "",
      make: (input, index) =>
        runIndex(index, 1) === null ? null : insert(trimEdges(input)),
    };
  }
  const shown = runs.map((run) => collapse(run.text));
  const first = shown[0] ?? "";
  const readOnly = { value: first === "" ? "…" : `${first} …`, make: null };
  if (runs.length > MAX_TEXT_RUNS || content.dynamic > 0) return readOnly;
  // Whitespace shown as written: editable only when every run reads the same collapsed.
  if (content.preserve && runs.some((run, i) => shown[i] !== trimEdges(run.text)))
    return runs.length === 1 ? { value: first, make: null } : readOnly;
  const binding: Binding = {
    value: first,
    make: (input, index) => {
      const at = runIndex(index, runs.length);
      if (at === null) return null;
      const run = runs[at];
      return { from: run.from, to: run.to, value: run.write(trimEdges(input), runs.length > 1 || run.emptySlot) };
    },
  };
  if (runs.length > 1) binding.runs = shown;
  return binding;
}
