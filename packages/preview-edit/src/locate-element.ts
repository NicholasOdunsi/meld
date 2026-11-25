import { packages } from "@babel/standalone";
import type { NodePath, types as t } from "@babel/core";

export type ElementRange = { start: number; end: number };

export function offsetOf(source: string, line: number, column: number): number | null {
  if (!Number.isInteger(line) || !Number.isInteger(column) || line < 1 || column < 1) return null;
  const lines = source.split("\n");
  if (line > lines.length) return null;
  let offset = column - 1;
  for (let index = 0; index < line - 1; index++) offset += lines[index]!.length + 1;
  return offset <= source.length ? offset : null;
}

// The element whose opening "<" is exactly at the resolved position. The dev server's column points at that "<".
export function locateElementAt(source: string, file: string, line: number, column: number): ElementRange | null {
  const offset = offsetOf(source, line, column);
  if (offset === null) return null;
  try {
    const ast = packages.parser.parse(source, {
      sourceType: "unambiguous",
      plugins: /\.tsx?$/.test(file) ? ["typescript", "jsx"] : ["jsx"],
    });
    let found: ElementRange | null = null;
    packages.traverse.default(ast, {
      JSXElement(path: NodePath<t.JSXElement>) {
        const { start, end } = path.node;
        if (start === offset && end != null) {
          found = { start, end };
          path.stop();
        }
      },
    });
    return found;
  } catch {
    return null;
  }
}
