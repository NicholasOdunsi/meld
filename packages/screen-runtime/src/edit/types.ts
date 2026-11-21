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
export type Tweak = { field: Field; value: string };
export type Files = Record<string, string>;
export type Range = { file: string; start: number; end: number };
export type EditResult =
  | { ok: true; files: Files }
  | { ok: false; reason: "not-found" | "not-literal" };
export type FieldState = { editable: boolean; value: string | null };
export type Inspection = Record<Field, FieldState> | null;
