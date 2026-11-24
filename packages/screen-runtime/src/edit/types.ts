export const FIELDS = [
  "text",
  "color",
  "backgroundColor",
  "fontSize",
  "fontWeight",
  "fontFamily",
  "padding",
  "gap",
  "borderRadius",
  "width",
  "height",
] as const;
export type Field = (typeof FIELDS)[number];
// The most text runs one element offers as separate Text fields; an element with more is read-only.
export const MAX_TEXT_RUNS = 8;
// `index` picks one of the element's text runs (0 to MAX_TEXT_RUNS - 1); only the text field takes
// it, and a message without it edits the first run.
export type Tweak = { field: Field; value: string; index?: number };
export type Files = Record<string, string>;
export type Range = { file: string; start: number; end: number };
export type EditResult =
  | { ok: true; files: Files }
  | { ok: false; reason: "not-found" | "not-literal" };
// `runs` is set only on an editable text field with several runs (2 to MAX_TEXT_RUNS), including
// cleared slots so their indices stay stable: what each
// run shows, in order, each its own Text field. `value` is then the first run.
export type FieldState = { editable: boolean; value: string | null; runs?: string[] };
export type Inspection = Record<Field, FieldState> | null;
