import { randomUUID } from "node:crypto";
import { promises as fs } from "node:fs";
import path from "node:path";
import { applyTweak, inspectElement } from "@meld/screen-runtime/edit";
import type { Inspection, Tweak } from "@meld/screen-runtime/edit/types";
import { locateElementAt } from "./locate-element";

// `fuzzy` marks a position from React 18's _debugSource, whose column base differs by toolchain: try it, then one less.
export type Source = { file: string; line: number; column: number; fuzzy?: boolean };
export type Change = { path: string; before: string; after: string };
export type Failure = "not-found" | "not-literal" | "too-large" | "outside-root" | "conflict";
export type Outcome =
  | { ok: true; fields: NonNullable<Inspection>; changes: Change[] }
  | { ok: false; reason: Failure };

const MAX_FILE_CHARS = 200_000;
const JSX_FILE = /\.(tsx|jsx|js)$/;

type Resolved = { absolute: string; relative: string };

// A file the helper may touch: a .tsx/.jsx inside the root, outside node_modules, reached without leaving the
// root (symlinks are resolved first). Anything else is "outside-root".
async function resolveInRoot(root: string, file: string): Promise<Resolved | null> {
  const realRoot = await fs.realpath(root).catch(() => null);
  if (!realRoot) return null;
  // An absolute path may name the root as given (e.g. /var/...) or as resolved (/private/var/...); both are
  // checked lexically here, and the realpath check below is what actually enforces containment.
  const lexical = (base: string) => path.relative(base, file);
  const escapes = (rel: string) => !rel || rel.startsWith("..") || path.isAbsolute(rel);
  let candidate = path.isAbsolute(file) ? lexical(realRoot) : path.normalize(file);
  if (path.isAbsolute(file) && escapes(candidate)) candidate = lexical(path.resolve(root));
  if (!candidate || candidate.startsWith("..") || path.isAbsolute(candidate)) return null;
  if (candidate.split(path.sep).includes("node_modules") || !JSX_FILE.test(candidate)) return null;
  const real = await fs.realpath(path.join(realRoot, candidate)).catch(() => null);
  if (!real || !real.startsWith(realRoot + path.sep)) return null;
  // The requested name is not what gets read or written: re-check the resolved target, which may sit in
  // node_modules or be a non-JSX file reached through a link or a different spelling.
  const relative = path.relative(realRoot, real);
  if (relative.split(path.sep).includes("node_modules") || !JSX_FILE.test(relative)) return null;
  return { absolute: real, relative };
}

async function writeAtomically(file: string, contents: string): Promise<void> {
  const temporary = `${file}.${randomUUID()}.tmp`;
  try {
    await fs.writeFile(temporary, contents);
    await fs.rename(temporary, file);
  } finally {
    await fs.rm(temporary, { force: true });
  }
}

function findRange(text: string, file: string, src: Source) {
  return locateElementAt(text, file, src.line, src.column)
    ?? (src.fuzzy && src.column > 1 ? locateElementAt(text, file, src.line, src.column - 1) : null);
}

type Target = { resolved: Resolved; text: string; entry: string; tag: string };

async function target(root: string, src: Source): Promise<Target | Failure> {
  const resolved = await resolveInRoot(root, src.file);
  if (!resolved) return "outside-root";
  const text = await fs.readFile(resolved.absolute, "utf8").catch(() => null);
  if (text === null) return "not-found";
  if (text.length > MAX_FILE_CHARS) return "too-large";
  const range = findRange(text, resolved.relative, src);
  if (!range) return "not-found";
  // The edit library only knows screen-shaped paths; it needs the extension and nothing else.
  const entry = `entry.${path.extname(resolved.relative).slice(1)}`;
  return { resolved, text, entry, tag: `${entry}:${range.start}:${range.end}` };
}

export async function inspect(root: string, src: Source): Promise<Outcome> {
  const found = await target(root, src);
  if (typeof found === "string") return { ok: false, reason: found };
  const fields = inspectElement({ [found.entry]: found.text }, found.tag);
  return fields ? { ok: true, fields, changes: [] } : { ok: false, reason: "not-found" };
}

export async function apply(root: string, src: Source, tweak: Tweak): Promise<Outcome> {
  const found = await target(root, src);
  if (typeof found === "string") return { ok: false, reason: found };
  const result = applyTweak({ [found.entry]: found.text }, found.tag, tweak);
  if (!result.ok) return { ok: false, reason: result.reason };
  const after = result.files[found.entry]!;
  // An edit inside the element never moves its opening "<", so the same position still finds it. Confirm that
  // in memory first: the file is written only once the edit can be reported (and so undone).
  const range = findRange(after, found.resolved.relative, src);
  const fields = range ? inspectElement({ [found.entry]: after }, `${found.entry}:${range.start}:${range.end}`) : null;
  if (!fields) return { ok: false, reason: "not-found" };
  await writeAtomically(found.resolved.absolute, after);
  return { ok: true, fields, changes: [{ path: found.resolved.relative, before: found.text, after }] };
}

export async function restore(
  root: string,
  files: { path: string; expect: string; contents: string }[],
): Promise<{ ok: true; changes: Change[] } | { ok: false; reason: Failure }> {
  const planned: { resolved: Resolved; before: string; contents: string }[] = [];
  for (const file of files) {
    const resolved = await resolveInRoot(root, file.path);
    if (!resolved) return { ok: false, reason: "outside-root" };
    const current = await fs.readFile(resolved.absolute, "utf8").catch(() => null);
    if (current === null) return { ok: false, reason: "not-found" };
    if (current !== file.expect) return { ok: false, reason: "conflict" };
    if (file.contents.length > MAX_FILE_CHARS) return { ok: false, reason: "too-large" };
    planned.push({ resolved, before: current, contents: file.contents });
  }
  for (const item of planned) await writeAtomically(item.resolved.absolute, item.contents);
  return { ok: true, changes: planned.map((item) => ({ path: item.resolved.relative, before: item.before, after: item.contents })) };
}
