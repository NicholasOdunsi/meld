// Worker entry point. Do not import this module from board-facing code;
// use ./types for the structured-clone-compatible contracts instead.
import { ScreenFilesSchema } from "../source";
import { parseTag } from "../tag-elements";
import { locateHtml } from "./html";
import { locateJsx } from "./jsx";
import { spliceAt, type EditableNode } from "./patch";
import {
  FIELDS,
  type EditResult,
  type Files,
  MAX_TEXT_RUNS,
  type Inspection,
  type Range,
  type Tweak,
} from "./types";

function locate(files: Files, range: Range): EditableNode | null {
  if (
    !Object.hasOwn(files, range.file) ||
    range.start >= range.end ||
    range.end > files[range.file].length
  )
    return null;
  try {
    if (/\.html?$/i.test(range.file))
      return locateHtml(files[range.file], range);
    if (/\.[jt]sx?$/i.test(range.file))
      return locateJsx(files[range.file], range);
    return null;
  } catch {
    // Invalid drafts are still authored source; never let parser errors escape.
    return null;
  }
}

export function inspectElement(files: Files, src: string): Inspection {
  const range = parseTag(src);
  if (!range || !ScreenFilesSchema.safeParse(files).success) return null;
  return locate(files, range)?.inspect() ?? null;
}

export function applyTweak(
  files: Files,
  src: string,
  tweak: Tweak,
): EditResult {
  const range = parseTag(src);
  if (!range || !ScreenFilesSchema.safeParse(files).success)
    return { ok: false, reason: "not-found" };
  const node = locate(files, range);
  if (!node) return { ok: false, reason: "not-found" };
  if (!FIELDS.includes(tweak.field) || typeof tweak.value !== "string")
    return { ok: false, reason: "not-literal" };
  // A run index is a whole number below MAX_TEXT_RUNS, and only text has runs.
  if (
    tweak.index !== undefined &&
    (tweak.field !== "text" ||
      !Number.isInteger(tweak.index) ||
      tweak.index < 0 ||
      tweak.index >= MAX_TEXT_RUNS)
  )
    return { ok: false, reason: "not-literal" };
  const patch = node.patch(tweak);
  if (
    !patch ||
    !Number.isSafeInteger(patch.from) ||
    !Number.isSafeInteger(patch.to) ||
    patch.from < range.start ||
    patch.to > range.end ||
    patch.from > patch.to
  )
    return { ok: false, reason: "not-literal" };
  const next = { ...files, [range.file]: spliceAt(files[range.file], patch) };
  return ScreenFilesSchema.safeParse(next).success
    ? { ok: true, files: next }
    : { ok: false, reason: "not-literal" };
}
