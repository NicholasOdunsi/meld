// An element tag is "file:start:end": the span of one JSX element in a source
// file. This is the one parser for it in the page. The screen runtime has its
// own, but it lives in a module that pulls Babel into the bundle.
export type ElementTag = { file: string; start: number; end: number };

export function parseElementTag(value: string): ElementTag | null {
  const match = /^(.+):(\d+):(\d+)$/.exec(value);
  if (!match) return null;
  const start = Number(match[2]);
  const end = Number(match[3]);
  if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end) return null;
  return { file: match[1], start, end };
}
