import { originalPositionFor, TraceMap } from "@jridgewell/trace-mapping";
import { reactFiber, resolveSource, type ResolvedSource } from "./creation-frame";

export type UrlFrame = { methodName: string; url: string; line: number; column: number };

// React 17/18 dev builds record where an element was written when the JSX-source transform is on.
export function fromDebugSource(element: Element): ResolvedSource | null {
  const source = reactFiber(element)?._debugSource as { fileName?: unknown; lineNumber?: unknown; columnNumber?: unknown } | undefined;
  if (!source || typeof source.fileName !== "string" || !Number.isInteger(source.lineNumber) || !Number.isInteger(source.columnNumber)) return null;
  return { file: source.fileName, line: source.lineNumber as number, column: source.columnNumber as number, fuzzy: true };
}

const URL_FRAME = /^\s*at (?:(\S+) )?\(?(https?:\/\/[^\s)]+?):(\d+):(\d+)\)?\s*$/;
const WEBKIT_URL_FRAME = /^\s*([^@]*)@(https?:\/\/\S+):(\d+):(\d+)\s*$/;

export function parseUrlFrames(stack: string): UrlFrame[] {
  const frames: UrlFrame[] = [];
  for (const line of stack.split("\n")) {
    const match = URL_FRAME.exec(line) ?? WEBKIT_URL_FRAME.exec(line);
    if (match) frames.push({ methodName: match[1] ?? "", url: match[2]!, line: Number(match[3]), column: Number(match[4]) });
  }
  return frames;
}

const REACT_INTERNAL = /jsxDEV|jsxs?$|react_stack|renderWith|react-stack/;
const LIBRARY_PATH = /\/(node_modules|\.vite\/deps|@vite|@react-refresh|@id)(\/|$)/;

// The first frame that is the app's own component: same origin, not React's runtime, not a dependency bundle.
export function firstAppFrame(frames: UrlFrame[], origin: string): UrlFrame | null {
  for (const frame of frames) {
    let url: URL;
    try { url = new URL(frame.url); } catch { continue; }
    if (url.origin !== origin || REACT_INTERNAL.test(frame.methodName) || LIBRARY_PATH.test(url.pathname)) continue;
    return frame;
  }
  return null;
}

// Where a source-map "source" lives in the project, relative to its root.
export function projectPath(source: string, moduleUrl: string): string | null {
  const webpack = /^webpack:\/\/[^/]*\/(?:\.\/)?(.+)$/.exec(source);
  if (webpack) return webpack[1]!;
  try {
    const path = decodeURIComponent(new URL(source, moduleUrl).pathname).replace(/^\/+/, "");
    return path || null;
  } catch {
    return null;
  }
}

async function loadMap(moduleUrl: string, fetchImpl: typeof fetch): Promise<unknown | null> {
  const text = await (await fetchImpl(moduleUrl)).text();
  const reference = [...text.matchAll(/\/\/[#@] sourceMappingURL=(\S+)/g)].at(-1)?.[1];
  if (!reference) return null;
  if (reference.startsWith("data:")) {
    const inline = /^data:application\/json(?:;charset=[^;,]+)?;base64,(.+)$/.exec(reference);
    if (!inline) return null;
    return JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(inline[1]!), (char) => char.charCodeAt(0))));
  }
  return (await fetchImpl(new URL(reference, moduleUrl).href)).json();
}

// Any bundler that serves source maps (Vite, Parcel, Create React App, Rspack...): decode React's creation
// position in the served module back to the file the author wrote.
export async function fromSourceMap(element: Element, fetchImpl: typeof fetch, origin: string): Promise<ResolvedSource | null> {
  const stack = (reactFiber(element)?._debugStack as { stack?: unknown } | undefined)?.stack;
  if (typeof stack !== "string") return null;
  const frame = firstAppFrame(parseUrlFrames(stack), origin);
  if (!frame) return null;
  try {
    const map = await loadMap(frame.url, fetchImpl);
    if (!map) return null;
    const original = originalPositionFor(new TraceMap(map as ConstructorParameters<typeof TraceMap>[0]), { line: frame.line, column: frame.column - 1 });
    if (original.source === null || original.line === null || original.column === null) return null;
    const file = projectPath(original.source, frame.url);
    // A library component's element decodes into its package; that is never a file the user can edit.
    if (!file || file.split("/").includes("node_modules")) return null;
    return { file, line: original.line, column: original.column + 1 };
  } catch {
    return null;
  }
}

export async function resolveAnySource(
  element: Element,
  fetchImpl: typeof fetch = fetch,
  origin: string = location.origin,
): Promise<ResolvedSource | null> {
  return fromDebugSource(element) ?? (await resolveSource(element, fetchImpl)) ?? (await fromSourceMap(element, fetchImpl, origin));
}
