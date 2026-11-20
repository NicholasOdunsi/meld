import { ScreenSourceSchema, type ScreenKind, type ScreenSource } from "@meld/screen-runtime/source";

export type PastedSource = { ok: true; source: ScreenSource } | { ok: false; message: string };
export const NO_EXPORT_MESSAGE = "Export your component as default, for example: export default function App() { … }";
export const TOO_LARGE_MESSAGE = "This code is too large. A screen can be at most 256 KB.";

const EXPORTS_COMPONENT = /\bexport\s+default\b|\bexport\s+(function|const|class)\s+App\b|\bexport\s*\{[^}]*\bApp\b[^}]*\}/;
const MODULE_SYNTAX = /^\s*(import|export)\s/m;
const DECLARES_APP = /^(?:function\s+App\b|const\s+App\s*=|class\s+App\b)/m;

// The runtime mounts the entry's default export, or its `App` export.
export function normalizeReact(code: string): string | null {
  const text = code.trim();
  if (EXPORTS_COMPONENT.test(text)) return text;
  if (!MODULE_SYNTAX.test(text) && text.startsWith("<")) {
    return `export default function App() {\n  return (\n    <>\n${text}\n    </>\n  );\n}\n`;
  }
  if (DECLARES_APP.test(text)) return `${text}\n\nexport default App;\n`;
  return null;
}

export function buildPastedSource(code: string, kind: ScreenKind): PastedSource {
  let candidate: ScreenSource;
  if (kind === "react") {
    const normalized = normalizeReact(code);
    if (normalized === null) return { ok: false, message: NO_EXPORT_MESSAGE };
    candidate = { kind, files: { "App.tsx": normalized }, entry: "App.tsx" };
  } else {
    candidate = { kind, files: { "index.html": code.trim() }, entry: "index.html" };
  }
  const parsed = ScreenSourceSchema.safeParse(candidate);
  return parsed.success ? { ok: true, source: parsed.data } : { ok: false, message: TOO_LARGE_MESSAGE };
}
