export type CreationFrame = { methodName: string; file: string; line: number; column: number };
export type ResolvedSource = { file: string; line: number; column: number; fuzzy?: boolean };

// "at Home (webpack-internal:///(app-pages-browser)/./app/page.tsx:541:104)". The path is lazy so a
// route-group folder such as (shop) keeps its parentheses.
const APP_FRAME = /\bat (?:(\S+) )?\((webpack-internal:\/\/\/\(app-pages-browser\)\/\.\/.+?):(\d+):(\d+)\)/;

export function parseCreationFrame(stack: string): CreationFrame | null {
  for (const line of stack.split("\n")) {
    const match = APP_FRAME.exec(line);
    if (match) return { methodName: match[1] ?? "", file: match[2]!, line: Number(match[3]), column: Number(match[4]) };
  }
  return null;
}

export function reactFiber(element: Element): Record<string, unknown> | null {
  const key = Object.keys(element).find((name) => name.startsWith("__reactFiber$"));
  return key ? ((element as unknown as Record<string, Record<string, unknown> | undefined>)[key] ?? null) : null;
}

function creationStack(element: Element): string | null {
  const stack = (reactFiber(element)?._debugStack as { stack?: unknown } | undefined)?.stack;
  return typeof stack === "string" ? stack : null;
}

// React 19 dev builds remember where each element was created; Next's dev server maps that position back to
// the original source. Both are internal, so any surprise (missing fiber, server error, odd reply) is null.
export async function resolveSource(element: Element, fetchImpl: typeof fetch = fetch): Promise<ResolvedSource | null> {
  const stack = creationStack(element);
  const frame = stack ? parseCreationFrame(stack) : null;
  if (!frame) return null;
  try {
    const response = await fetchImpl("/__nextjs_original-stack-frames", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        frames: [{ file: frame.file, methodName: frame.methodName, line1: frame.line, column1: frame.column, arguments: [] }],
        isServer: false, isEdgeServer: false, isAppDirectory: true,
      }),
    });
    if (!response.ok) return null;
    const [first] = (await response.json()) as { status?: string; value?: { originalStackFrame?: { file?: unknown; line1?: unknown; column1?: unknown } } }[];
    const original = first?.status === "fulfilled" ? first.value?.originalStackFrame : undefined;
    if (!original || typeof original.file !== "string" || !Number.isInteger(original.line1) || !Number.isInteger(original.column1)) return null;
    return { file: original.file, line: original.line1 as number, column: original.column1 as number };
  } catch {
    return null;
  }
}
