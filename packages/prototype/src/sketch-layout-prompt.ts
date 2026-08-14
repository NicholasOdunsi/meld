import type { SketchLayout } from "./sketch-layout";

export function formatSketchLayoutForPrompt(layout: SketchLayout): string {
  if (layout.boxes.length === 0) return "";
  const lines = layout.boxes.map((b) => {
    const where = `${b.position.vertical}-${b.position.horizontal}`;
    const what = `${b.size.width} ${b.shapeKind}`;
    return b.text ? `- ${what} at ${where}: "${b.text}"` : `- ${what} at ${where}`;
  });
  const note = layout.truncated ? "\n(additional shapes were omitted)" : "";
  return `The user sketched this rough layout — use it for WHERE things go; the instruction says WHAT each region is:\n${lines.join("\n")}${note}`;
}
