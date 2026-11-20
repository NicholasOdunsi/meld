import { ScreenSourceSchema, type ScreenKind, type ScreenSource } from "@meld/screen-runtime/source";

export type PastedSource = { ok: true; source: ScreenSource } | { ok: false; message: string };
export const NO_EXPORT_MESSAGE = "Export your component as default, for example: export default function App() { … }";
export const TOO_LARGE_MESSAGE = "This code is too large. A screen can be at most 256 KB.";

// Only module-scope tokens can declare a mount or export it. Comments, strings,
// templates, nested blocks and JSX are skipped rather than searched as source text.
function moduleTokens(code: string): string[] {
  const tokens: string[] = [];
  let offset = 0;
  const quote = (delimiter: string) => {
    offset++;
    while (offset < code.length) {
      if (code[offset++] === "\\") offset++;
      else if (code[offset - 1] === delimiter) break;
    }
  };
  const comment = () => {
    if (code.startsWith("//", offset)) {
      const end = code.indexOf("\n", offset + 2);
      offset = end < 0 ? code.length : end;
      return true;
    }
    if (code.startsWith("/*", offset)) {
      const end = code.indexOf("*/", offset + 2);
      offset = end < 0 ? code.length : end + 2;
      return true;
    }
    return false;
  };
  const balanced = (closing: string) => {
    const stack = [closing];
    offset++;
    while (offset < code.length && stack.length) {
      if (comment()) continue;
      const char = code[offset]!;
      if (char === '"' || char === "'" || char === "`") { quote(char); continue; }
      if (char === stack.at(-1)) stack.pop();
      else if (char === "{") stack.push("}");
      else if (char === "(") stack.push(")");
      else if (char === "[") stack.push("]");
      offset++;
    }
  };
  const jsx = () => {
    let depth = 0;
    do {
      if (code[offset] === "<") {
        const closing = code[offset + 1] === "/";
        offset++;
        while (offset < code.length && code[offset] !== ">") {
          if (code[offset] === '"' || code[offset] === "'") quote(code[offset]!);
          else if (code[offset] === "{") balanced("}");
          else offset++;
        }
        const selfClosing = code[offset - 1] === "/";
        if (offset < code.length) offset++;
        depth += closing ? -1 : selfClosing ? 0 : 1;
      } else if (code[offset] === "{") balanced("}");
      else offset++;
    } while (offset < code.length && depth > 0);
  };
  while (offset < code.length) {
    if (comment()) continue;
    const char = code[offset]!;
    if (/\s/.test(char)) { offset++; continue; }
    if (char === '"' || char === "'" || char === "`") { quote(char); tokens.push("literal"); continue; }
    if (char === "/" && [undefined, "=", ":", ",", "return", ">", "!", "?", ";"].includes(tokens.at(-1))) {
      offset++;
      let inClass = false;
      while (offset < code.length) {
        const part = code[offset++]!;
        if (part === "\\") offset++;
        else if (part === "[") inClass = true;
        else if (part === "]") inClass = false;
        else if (part === "/" && !inClass) break;
      }
      while (/[a-z]/i.test(code[offset] ?? "")) offset++;
      tokens.push("literal"); continue;
    }
    if (char === "<" && /[A-Za-z>]/.test(code[offset + 1] ?? "") &&
        ["=", ">", "return", "(", ":"].includes(tokens.at(-1) ?? "")) {
      jsx(); tokens.push("jsx"); continue;
    }
    if (char === "{") {
      // Export lists are the only brace contents relevant at module scope.
      if (tokens.at(-1) === "export") {
        tokens.push(char); offset++;
        while (offset < code.length && code[offset] !== "}") {
          if (comment()) continue;
          if (/\s/.test(code[offset]!)) { offset++; continue; }
          const word = /^[A-Za-z_$][\w$]*/.exec(code.slice(offset));
          tokens.push(word?.[0] ?? code[offset]!);
          offset += word?.[0].length ?? 1;
        }
        tokens.push("}"); if (offset < code.length) offset++;
      } else { balanced("}"); tokens.push("block"); }
      continue;
    }
    if (char === "(" || char === "[") { balanced(char === "(" ? ")" : "]"); tokens.push("group"); continue; }
    const word = /^[A-Za-z_$][\w$]*/.exec(code.slice(offset));
    tokens.push(word?.[0] ?? char);
    offset += word?.[0].length ?? 1;
  }
  return tokens;
}

function exportsMount(tokens: string[]): boolean {
  for (let index = 0; index < tokens.length; index++) {
    if (tokens[index] !== "export") continue;
    const next = tokens[index + 1];
    if (next === "default") return true;
    if (["function", "const", "let", "var", "class"].includes(next ?? "") && tokens[index + 2] === "App") return true;
    if (next !== "{") continue;
    let item: string[] = [];
    for (let cursor = index + 2; cursor < tokens.length; cursor++) {
      const token = tokens[cursor]!;
      if (token === "," || token === "}") {
        const exported = item.includes("as") ? item[item.indexOf("as") + 1] : item[0];
        if (exported === "default" || exported === "App") return true;
        item = [];
        if (token === "}") break;
      } else item.push(token);
    }
  }
  return false;
}

// The runtime mounts the entry's default export, or its `App` export.
export function normalizeReact(code: string): string | null {
  const text = code.trim();
  if (text.startsWith("<")) {
    return `export default function App() {\n  return (\n    <>\n${text}\n    </>\n  );\n}\n`;
  }
  const tokens = moduleTokens(text);
  if (exportsMount(tokens)) return text;
  const declaresApp = tokens.some((token, index) => {
    if (tokens[index + 1] !== "App") return false;
    if (["const", "let", "var"].includes(token)) return true;
    if (token !== "function" && token !== "class") return false;
    const previous = tokens[index - 1] === "async" ? tokens[index - 2] : tokens[index - 1];
    return !["=", ":", ",", "return", ">"].includes(previous ?? "");
  });
  if (declaresApp) {
    return `${text}\n\nexport default App;\n`;
  }
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
