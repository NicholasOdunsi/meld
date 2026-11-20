import type { ScreenKind } from "@meld/screen-runtime/source";

export type DetectedKind = { ok: true; kind: ScreenKind } | { ok: false; message: string };
export const EMPTY_PASTE_MESSAGE = "Paste some code first.";
export const NOT_CODE_MESSAGE = "This doesn't look like React or HTML. Paste a React component or an HTML page.";

const MODULE_SYNTAX = /^\s*(import|export)\s/m;
const LEADING_TAG = /^<(!doctype\b|>|[a-z][a-z0-9-]*[\s>/])/i;
// JSX-only syntax: className, attr={…} (not inside a quoted HTML attribute),
// fragments and JSX comments.
const JSX_ONLY = /\sclassName=|\s[A-Za-z][\w-]*=\{|^<>|\{\s*\/\*/m;
// Mask quoted attribute contents while preserving their names and assignment syntax.
const QUOTED_ATTRIBUTE = /=\s*(?:"[^"\\]*(?:\\.[^"\\]*)*"|'[^'\\]*(?:\\.[^'\\]*)*')/g;
const COMPONENT_RETURNING_JSX = /(=>|\breturn\b)\s*\(?\s*<[A-Za-z>]/;

export function detectScreenKind(code: string): DetectedKind {
  const text = code.trim();
  if (!text) return { ok: false, message: EMPTY_PASTE_MESSAGE };
  if (LEADING_TAG.test(text)) return { ok: true, kind: JSX_ONLY.test(text.replace(/(<(script|style)\b[^>]*>)[\s\S]*?<\/\2\s*>/gi, '$1').replace(QUOTED_ATTRIBUTE, '=""')) ? "react" : "html" };
  if (MODULE_SYNTAX.test(text)) return { ok: true, kind: "react" };
  if (COMPONENT_RETURNING_JSX.test(text)) return { ok: true, kind: "react" };
  return { ok: false, message: NOT_CODE_MESSAGE };
}
