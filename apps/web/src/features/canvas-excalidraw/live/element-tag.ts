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

// Where an element's tag points after a file was edited in one place (an undo, a redo).
// The edit is found by trimming the text both versions share at the start and at the end;
// what is left is the one changed region. If that region lies wholly after the element the
// tag is unchanged, wholly before it the tag moves by the change in length, and inside it
// only the end moves. An insertion exactly at its start goes before it and shifts it;
// an edit that crosses an edge of the element cannot be placed: null.
//
// Trimming is ambiguous when the inserted or removed text repeats its neighbours (adding
// "<p>x</p>" before "<b>" can read as adding "p>x</p><" inside it). So the region is placed
// both ways, trimming the start first and the end first. Two different answers are settled
// by the element's own text: only a placement where the element reads the same as before wins,
// and if that is not exactly one, null.
type Placed = { tag: string; sameText: boolean };

export function remapTag(oldFiles: Record<string, string>, newFiles: Record<string, string>, src: string): string | null {
  const tag = parseElementTag(src);
  if (!tag || !Object.hasOwn(oldFiles, tag.file) || !Object.hasOwn(newFiles, tag.file)) return null;
  const before = oldFiles[tag.file];
  const after = newFiles[tag.file];
  if (before === after) return src;
  const room = Math.min(before.length, after.length);
  const common = (limit: number, step: (index: number) => boolean) => {
    let count = 0;
    while (count < limit && step(count)) count += 1;
    return count;
  };
  const prefixOf = (limit: number) => common(limit, (i) => before[i] === after[i]);
  const suffixOf = (limit: number) => common(limit, (i) => before[before.length - 1 - i] === after[after.length - 1 - i]);
  const startFirst = prefixOf(room);
  const endFirst = suffixOf(room);
  const delta = after.length - before.length;
  const elementText = before.slice(tag.start, tag.end);
  const place = (from: number, to: number): Placed | null => {
    if (from >= tag.end) return { tag: src, sameText: after.slice(tag.start, tag.end) === elementText };
    // Nothing of the element survives: it was replaced by something else.
    if (from <= tag.start && to >= tag.end) return null;
    const moved = (start: number, end: number): string | null => (end > start ? `${tag.file}:${start}:${end}` : null);
    if (to <= tag.start) {
      const shifted = moved(tag.start + delta, tag.end + delta);
      return shifted ? { tag: shifted, sameText: after.slice(tag.start + delta, tag.end + delta) === elementText } : null;
    }
    if (from >= tag.start && to <= tag.end) {
      const grown = moved(tag.start, tag.end + delta);
      return grown ? { tag: grown, sameText: false } : null;
    }
    return null;
  };
  const readings = [
    place(startFirst, before.length - suffixOf(room - startFirst)),
    place(prefixOf(room - endFirst), before.length - endFirst),
  ];
  if (readings[0] && readings[1] && readings[0].tag === readings[1].tag) return readings[0].tag;
  const kept = new Set(readings.filter((reading) => reading?.sameText).map((reading) => reading!.tag));
  return kept.size === 1 ? [...kept][0] : null;
}
