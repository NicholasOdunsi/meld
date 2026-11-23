// Text runs: the direct text children of an element, between its other children (elements, <br>,
// comments, {expressions}). HTML and JSX each list their element's children as `Content`; the rules
// for which text is editable, what the Text field shows and what an edit writes live here, once.
import type { Binding, Patch } from "./patch";

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
  write: (value: string) => string;
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
};

export function nonBlankRuns(content: Content): Run[] {
  return content.runs.filter((run) => !isBlank(run.text));
}

// The Text field's binding: editable when the element has exactly one non-blank text run and nothing
// computed; read-only (make: null) with its static text when it has more; null when it holds no text.
export function textBinding(content: Content): Binding | null {
  const runs = nonBlankRuns(content);
  if (runs.length === 0 && content.dynamic === 0) {
    if (content.elements > 0 || !content.insert) return null;
    const insert = content.insert;
    return {
      value: "",
      make: (input) => insert(trimEdges(input)),
    };
  }
  const shown = runs.length > 0 ? collapse(runs[0].text) : "";
  if (runs.length !== 1 || content.dynamic > 0)
    return { value: shown === "" ? "…" : `${shown} …`, make: null };
  const run = runs[0];
  if (content.preserve && shown !== trimEdges(run.text))
    return { value: shown, make: null };
  return {
    value: shown,
    make: (input) => ({
      from: run.from,
      to: run.to,
      value: run.write(trimEdges(input)),
    }),
  };
}
